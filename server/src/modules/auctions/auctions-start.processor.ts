import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { BidRepository } from '@modules/bid/repositories/bid.repository';
import { RedisService } from '@shared/redis';
import { AUCTION_START_QUEUE, RECONCILIATION_BATCH_SIZE } from './auction.constants';
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
    private readonly bidRepository: BidRepository,
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
   *
   * Auctions are fetched in batches of {@link RECONCILIATION_BATCH_SIZE} rows to
   * avoid loading the entire ACTIVE set into memory at once — important when
   * hundreds (or thousands) of auctions could be active simultaneously.
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      const batchSize = RECONCILIATION_BATCH_SIZE;
      let skip = 0;
      let totalChecked = 0;
      let totalReconciled = 0;

      let activeAuctions: Auction[] = [];

      do {
        const now = new Date();

        const activeAuctions = await this.auctionRepository.find({
          where: { status: AuctionStatus.ACTIVE },
          order: { id: 'ASC' },
          skip,
          take: batchSize,
        });

        if (activeAuctions.length === 0) break;

        const auctionIds = activeAuctions.map((a) => a.id);
        const activeInRedis = await this.redisService.areAuctionsActive(auctionIds);
        const orphanedAuctions = activeAuctions.filter((a) => !activeInRedis.has(a.id));

        if (orphanedAuctions.length > 0) {
          const orphanedIds = orphanedAuctions.map((a) => a.id);

          const highestBids = await this.bidRepository.findByOrphanedIds(orphanedIds);

          const highestBidMap = new Map(highestBids.map((b) => [b.auctionId, b.userId]));

          for (const auction of orphanedAuctions) {
            try {
              const durationSeconds = Math.floor((new Date(auction.endTime).getTime() - now.getTime()) / 1000);

              if (durationSeconds <= 0) {
                await this.auctionRepository.update(auction.id, {
                  status: AuctionStatus.ENDED,
                  endedAt: now,
                });
                this.logger.warn(`Reconciliation: auction ${auction.id} past endTime — marked ENDED`);
              } else {
                const priceToRestore = auction.currentPrice ?? auction.startingPrice;
                const highestBidderIdToRestore = highestBidMap.get(auction.id) ?? null;

                await this.redisService.restoreAuction(auction.id, priceToRestore, durationSeconds, auction.ownerId, highestBidderIdToRestore);
                await this.auctionScheduler.scheduleAuctionEnd(auction.id, new Date(auction.endTime));

                this.logger.warn(
                  `Reconciliation: auction ${auction.id} re-initialized in Redis — price=${priceToRestore}, bidder=${highestBidderIdToRestore ?? 'none'}, ends in ${durationSeconds}s`,
                );
                totalReconciled++;
              }
            } catch (error) {
              this.logger.error(`Reconciliation: failed for auction ${auction.id}`, error instanceof Error ? error.stack : String(error));
            }
          }
        }

        totalChecked += activeAuctions.length;
        skip += batchSize;
      } while (activeAuctions.length === batchSize);

      if (totalReconciled > 0 || totalChecked > 0) this.logger.log(`Reconciliation complete — checked: ${totalChecked}, re-initialized: ${totalReconciled}`);
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

    await this.auctionScheduler.scheduleAuctionEnd(auctionId, new Date(auction.endTime));

    await this.redisService.invalidateCache('auctions:active:*');

    this.logger.log(`Auction ${auctionId} started — ends in ${durationSeconds}s`);
  }
}
