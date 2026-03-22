import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Bid } from '@modules/bid';
import { RedisService } from '@shared/redis';
import { AUCTION_START_QUEUE } from './auction.constants';
import { AuctionScheduler } from './auction.scheduler';
import { IAuctionJob } from './interfaces';
import { AuctionStatus } from './enums';
import { Auction } from './entities';
import { DataSource, Repository } from 'typeorm';
import { Job } from 'bullmq';

/**
 * Background processor responsible for transitioning auctions from PENDING to ACTIVE.
 * It ensures strict synchronization between the persistent database MySQL
 * and the fast in-memory store (Redis).
 */
@Injectable()
@Processor(AUCTION_START_QUEUE)
export class AuctionStartProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(AuctionStartProcessor.name);

  constructor(
    @InjectRepository(Auction)
    private readonly auctionRepository: Repository<Auction>,
    @InjectRepository(Bid)
    private readonly bidRepository: Repository<Bid>,
    private readonly redisService: RedisService,
    private readonly auctionScheduler: AuctionScheduler,
    private readonly dataSource: DataSource,
  ) {
    super();
  }

  /**
   * Server Startup Reconciliation mechanism.
   * * @remarks
   * Fixes inconsistencies where DB=ACTIVE but Redis has no corresponding keys.
   * Scenario: The server crashed immediately after writing 'ACTIVE' to the DB,
   * but before initializing Redis keys or scheduling the end job.
   * This method scans for orphaned active auctions on bootstrap and restores
   * them into Redis using their current database state and bidding history.
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      const now = new Date();
      const activeAuctions = await this.auctionRepository.find({
        where: { status: AuctionStatus.ACTIVE },
      });

      let reconciled = 0;

      for (const auction of activeAuctions) {
        const isActiveInRedis = await this.redisService.isAuctionActive(auction.id);

        if (!isActiveInRedis) {
          const durationSeconds = Math.floor((new Date(auction.endTime).getTime() - now.getTime()) / 1000);

          if (durationSeconds <= 0) {
            await this.auctionRepository.update(auction.id, {
              status: AuctionStatus.ENDED,
              endedAt: now,
            });
            this.logger.warn(`Reconciliation: auction ${auction.id} past endTime — marked ENDED`);
          } else {
            const priceToRestore = auction.currentPrice ?? auction.startingPrice;

            const highestBid = await this.bidRepository.findOne({
              where: { auctionId: auction.id },
              order: { amount: 'DESC' },
            });

            const highestBidderIdToRestore = highestBid?.userId ?? null;

            await this.redisService.restoreAuction(auction.id, priceToRestore, durationSeconds, auction.ownerId, highestBidderIdToRestore);

            //TODO: add end auction

            this.logger.warn(
              `Reconciliation: auction ${auction.id} re-initialized in Redis — price=${priceToRestore}, bidder=${highestBidderIdToRestore ?? 'none'}, ends in ${durationSeconds}s`,
            );
            reconciled++;
          }
        }
      }

      if (reconciled > 0 || activeAuctions.length > 0) this.logger.log(`Reconciliation complete — checked: ${activeAuctions.length}, re-initialized: ${reconciled}`);
    } catch (error) {
      this.logger.error('Reconciliation failed on bootstrap', error instanceof Error ? error.stack : String(error));
    }
  }

  /**
   * Core execution method for the BullMQ job.
   * * @param job - The BullMQ job payload containing the auctionId.
   */
  async process(job: Job<IAuctionJob>): Promise<void> {
    const { auctionId } = job.data;
    this.logger.log(`Processing auction start: ${auctionId}`);

    const auction = await this.auctionRepository.findOneBy({ id: auctionId });

    if (!auction) {
      this.logger.warn(`Auction ${auctionId} not found — skipping`);
      return;
    }

    if (auction.status !== AuctionStatus.PENDING) {
      this.logger.warn(`Auction ${auctionId} is not PENDING (status: ${auction.status}) — skipping`);
      return;
    }

    const now = new Date();
    const durationSeconds = Math.floor((new Date(auction.endTime).getTime() - now.getTime()) / 1000);

    if (durationSeconds <= 0) {
      this.logger.warn(`Auction ${auctionId} end time is already in the past — marking as ENDED without activation`);
      await this.auctionRepository.update(auctionId, {
        status: AuctionStatus.ENDED,
        endedAt: now,
      });
      return;
    }

    const wasStarted = await this.dataSource.transaction(async (em) => {
      const lockedAuction = await em.findOne(Auction, {
        where: { id: auctionId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!lockedAuction || lockedAuction.status !== AuctionStatus.PENDING) {
        this.logger.warn(`Auction ${auctionId} status changed before lock — skipping`);
        return false;
      }

      await em.update(Auction, auctionId, {
        status: AuctionStatus.ACTIVE,
        startedAt: now,
      });

      return true;
    });

    if (!wasStarted) return;

    await this.redisService.initializeAuction(auctionId, auction.startingPrice, durationSeconds, auction.ownerId);

    //TODO: add end auction

    this.logger.log(`Auction ${auctionId} started — ends in ${durationSeconds}s`);
  }
}
