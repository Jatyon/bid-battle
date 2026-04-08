import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { AUCTION_END_QUEUE, AUCTION_START_QUEUE } from './auction.constants';
import { IAuctionJob } from './interfaces';
import { Job, Queue } from 'bullmq';

/**
 * Service responsible for scheduling and managing time-based auction events.
 * Integrates with BullMQ to enqueue background jobs that will execute exactly
 * when an auction is supposed to start or end.
 */
@Injectable()
export class AuctionScheduler {
  private readonly logger = new Logger(AuctionScheduler.name);

  constructor(
    @InjectQueue(AUCTION_END_QUEUE)
    private readonly auctionEndQueue: Queue<IAuctionJob>,
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
    let delay = startsAt.getTime() - Date.now();

    if (delay <= 0) {
      this.logger.warn(`Auction ${auctionId} start time is in the past — starting immediately`);
      delay = 2000;
    }

    await this.auctionStartQueue.add(
      'start-auction',
      { auctionId },
      {
        delay: Math.max(delay, 0),
        jobId: `${AUCTION_START_QUEUE}-${auctionId}`,
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    );

    this.logger.log(`Auction ${auctionId} start scheduled in ${Math.round(Math.max(delay, 0) / 1000)}s`);
  }

  /**
   * Cancels a previously scheduled auction start job.
   * Typically used when a pending auction is deleted or manually canceled by the owner.
   *
   * @param auctionId - The unique identifier of the auction.
   * @returns A promise resolving when the job is removed from the queue.
   */
  async cancelAuctionStart(auctionId: number): Promise<void> {
    const job = await this.auctionStartQueue.getJob(`${AUCTION_START_QUEUE}-${auctionId}`);

    if (!job) return;

    await job.remove();
    this.logger.log(`Auction ${auctionId} start job cancelled`);
  }

  /**
   * Returns the BullMQ Job object for a scheduled auction start, or `null` if no such
   * job exists in the queue. Used by the startup reconciliation to detect PENDING auctions
   * that lost their job due to a crash between DB commit and BullMQ enqueue.
   *
   * @param auctionId - The unique identifier of the auction.
   * @returns The Job instance if found, or `null`.
   */
  async getStartJob(auctionId: number): Promise<Job<IAuctionJob> | null> {
    return (await this.auctionStartQueue.getJob(`${AUCTION_START_QUEUE}-${auctionId}`)) ?? null;
  }

  /**
   * Schedules a background job to finalize an auction at a specific time.
   * * @remarks
   * This job is responsible for picking the winner, clearing Redis cache,
   * and notifying users via WebSockets. Like the start job, it uses a predictable
   * `jobId` and exponential backoff.
   *
   * @param auctionId - The unique identifier of the auction to end.
   * @param endsAt - The scheduled end date and time.
   * @returns A promise resolving when the job is successfully added to the queue.
   */
  async scheduleAuctionEnd(auctionId: number, endsAt: Date): Promise<void> {
    let delay = endsAt.getTime() - Date.now();

    if (delay <= 0) {
      this.logger.warn(`Auction ${auctionId} end time is in the past — ending immediately`);
      delay = 2000;
    }

    await this.auctionEndQueue.add(
      'end-auction',
      { auctionId },
      {
        delay: Math.max(delay, 0),
        jobId: `${AUCTION_END_QUEUE}-${auctionId}`,
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    );

    this.logger.log(`Auction ${auctionId} end scheduled in ${Math.round(Math.max(delay, 0) / 1000)}s`);
  }

  /**
   * Cancels a previously scheduled auction end job.
   * Necessary when an active auction is prematurely canceled or extended.
   *
   * @param auctionId - The unique identifier of the auction.
   * @returns A promise resolving when the job is removed from the queue.
   */
  async cancelAuctionEnd(auctionId: number): Promise<void> {
    const job = await this.auctionEndQueue.getJob(`${AUCTION_END_QUEUE}-${auctionId}`);

    if (!job) return;

    await job.remove();
    this.logger.log(`Auction ${auctionId} end job cancelled`);
  }
}
