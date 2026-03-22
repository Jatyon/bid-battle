import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { AUCTION_START_QUEUE } from './auction.constants';
import { IAuctionJob } from './interfaces';
import { Queue } from 'bullmq';

/**
 * Service responsible for scheduling and managing time-based auction events.
 * Integrates with BullMQ to enqueue background jobs that will execute exactly
 * when an auction is supposed to start or end.
 */
@Injectable()
export class AuctionScheduler {
  private readonly logger = new Logger(AuctionScheduler.name);

  constructor(
    @InjectQueue(AUCTION_START_QUEUE)
    private readonly auctionStartQueue: Queue<IAuctionJob>,
  ) {}

  /**
   * Schedules a background job to activate an auction at a specific time.
   * * @remarks
   * Calculates the exact millisecond delay from 'now' to the 'startsAt' date.
   * If the date is in the past, the job is queued with a delay of 0 for immediate execution.
   * The job is assigned a predictable `jobId` to ensure uniqueness and allow future cancellation.
   * It also configures an exponential backoff strategy for high reliability.
   *
   * @param auctionId - The unique identifier of the auction to start.
   * @param startsAt - The scheduled start date and time.
   * @returns A promise resolving when the job is successfully added to the queue.
   */
  async scheduleAuctionStart(auctionId: number, startsAt: Date): Promise<void> {
    const delay = startsAt.getTime() - Date.now();

    if (delay <= 0) {
      this.logger.warn(`Auction ${auctionId} start time is in the past — starting immediately`);
    }

    await this.auctionStartQueue.add(
      'start-auction',
      { auctionId },
      {
        delay: Math.max(delay, 0),
        jobId: `auction-start-${auctionId}`,
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    );

    this.logger.log(`Auction ${auctionId} start scheduled in ${Math.round(Math.max(delay, 0) / 1000)}s`);
  }
}
