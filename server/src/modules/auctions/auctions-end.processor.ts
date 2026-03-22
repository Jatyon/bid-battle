import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { BidGateway } from '@modules/bid/bid.gateway';
import { RedisService } from '@shared/redis';
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

    await this.dataSource.transaction(async (em) => {
      const auction = await em.findOne(Auction, {
        where: { id: auctionId },
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

    if (!dbUpdated) {
      this.logger.log(`Auction ${auctionId} Redis cleanup done (DB was already ENDED)`);
      return;
    }

    this.bidGateway.notifyAuctionEnd(auctionId, winnerId ?? undefined, finalPrice ?? undefined);

    this.logger.log(`Auction ${auctionId} ended — winner: ${winnerId ?? 'None'}, price: ${finalPrice ?? 'None'}`);
  }
}
