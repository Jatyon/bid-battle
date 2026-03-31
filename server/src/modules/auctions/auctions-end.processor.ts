import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { UserPreferencesService, UsersService } from '@modules/users';
import { BidGateway } from '@modules/bid/bid.gateway';
import { RedisService } from '@shared/redis';
import { MailService } from '@shared/mail';
import { AUCTION_END_QUEUE } from './auction.constants';
import { IAuctionJob } from './interfaces';
import { AuctionStatus } from './enums';
import { Auction } from './entities';
import { DataSource } from 'typeorm';
import { Job } from 'bullmq';

/**
 * Background processor responsible for gracefully ending an auction.
 * It synchronizes the final state from Redis to the MySQL/PostgreSQL database,
 * clears the in-memory cache, and broadcasts the conclusion to connected users.
 */
@Processor(AUCTION_END_QUEUE)
export class AuctionEndProcessor extends WorkerHost {
  private readonly logger = new Logger(AuctionEndProcessor.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly bidGateway: BidGateway,
    private readonly mailService: MailService,
    private readonly usersService: UsersService,
    private readonly userPreferencesService: UserPreferencesService,
    private readonly dataSource: DataSource,
  ) {
    super();
  }

  /**
   * Core execution method for the auction-end BullMQ job.
   * * @remarks
   * Designed with strict idempotency. If the job crashes halfway through
   * (e.g., DB updated, but Redis not cleaned), the retry mechanism will safely
   * skip the DB update and proceed directly to Redis cleanup.
   *
   * @param job - The BullMQ job payload containing the auctionId.
   */
  async process(job: Job<IAuctionJob>): Promise<void> {
    const { auctionId } = job.data;

    this.logger.log(`Processing auction end: ${auctionId}`);

    const finalPrice = await this.redisService.getLivePrice(auctionId);

    if (!finalPrice) {
      this.logger.warn(`Auction ${auctionId} data already cleaned up from Redis — skipping`);
      return;
    }

    const winnerId = await this.redisService.getHighestBidderId(auctionId);

    let dbUpdated = false;
    let auction: Auction | null = null;

    await this.dataSource.transaction(async (em) => {
      auction = await em.findOne(Auction, {
        where: { id: auctionId },
        relations: ['owner'],
        lock: { mode: 'pessimistic_write' },
      });

      if (!auction) {
        this.logger.warn(`Auction ${auctionId} not found in DB during end processing`);
        return;
      }

      if (auction.status === AuctionStatus.ENDED) {
        this.logger.warn(`Auction ${auctionId} already marked as ENDED in DB — skipping DB update`);
        return;
      }

      await em.update(Auction, auctionId, {
        status: AuctionStatus.ENDED,
        currentPrice: finalPrice ?? auction.startingPrice,
        winnerId: winnerId ?? null,
        endedAt: new Date(),
      });

      dbUpdated = true;
    });

    await this.redisService.cleanupAuction(auctionId);
    await this.redisService.invalidateCache('auctions:active:*');

    if (!dbUpdated) {
      this.logger.log(`Auction ${auctionId} Redis cleanup done (DB was already ENDED)`);
      return;
    }

    this.bidGateway.notifyAuctionEnd(auctionId, winnerId ?? undefined, finalPrice ?? undefined);

    this.logger.log(`Auction ${auctionId} ended — winner: ${winnerId ?? 'None'}, price: ${finalPrice ?? 'None'}`);

    this.sendEndNotificationEmails(auction!, auctionId, finalPrice, winnerId).catch((err) =>
      this.logger.error(`Failed to send auction end emails for auction ${auctionId}`, err instanceof Error ? err.stack : String(err)),
    );
  }

  /**
   * Orchestrates sending end-of-auction emails independently to the owner and the winner.
   */
  private async sendEndNotificationEmails(auction: Auction, auctionId: number, finalPrice: number, winnerId: number | null): Promise<void> {
    const notifications = [this.notifyAuctionOwner(auction, auctionId, finalPrice, winnerId)];

    if (winnerId) notifications.push(this.notifyAuctionWinner(auction, auctionId, finalPrice, winnerId));

    const results = await Promise.allSettled(notifications);

    results.forEach((result) => {
      if (result.status === 'rejected') this.logger.error(`Error sending notification in auction ${auctionId}`, result.reason);
    });
  }

  /**
   * Sends end-of-auction notification to the auction OWNER.
   */
  private async notifyAuctionOwner(auction: Auction, auctionId: number, finalPrice: number, winnerId: number | null): Promise<void> {
    const owner = await this.usersService.findOneBy({ id: auction.ownerId });

    if (!owner) return;

    const prefs = await this.userPreferencesService.findByUserId(owner.id);

    if (!prefs.notifyOnAuctionEnd) return;

    let winnerName: string | undefined;

    if (winnerId) {
      const winner = await this.usersService.findOneBy({ id: winnerId });
      winnerName = winner?.concatName;
    }

    const lang = prefs.lang;

    await this.mailService.sendAuctionOwnerEmail(owner.email, lang, owner.concatName, auction.title, finalPrice, auctionId, winnerName);

    this.logger.log(`Owner email sent to user ${owner.id} for auction ${auctionId}`);
  }

  /**
   * Sends winning notification to the auction WINNER.
   */
  private async notifyAuctionWinner(auction: Auction, auctionId: number, finalPrice: number, winnerId: number): Promise<void> {
    const winner = await this.usersService.findOneBy({ id: winnerId });

    if (!winner) return;

    const prefs = await this.userPreferencesService.findByUserId(winner.id);

    if (!prefs?.notifyOnAuctionEnd) return;

    const lang = prefs.lang;

    await this.mailService.sendAuctionWinnerEmail(winner.email, lang, winner.concatName, auction.title, finalPrice, auctionId);

    this.logger.log(`Winner email sent to user ${winner.id} for auction ${auctionId}`);
  }
}
