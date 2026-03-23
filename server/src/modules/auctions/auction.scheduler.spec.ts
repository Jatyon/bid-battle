import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { AUCTION_END_QUEUE, AUCTION_START_QUEUE } from './auction.constants';
import { AuctionScheduler } from './auction.scheduler';

describe('AuctionScheduler', () => {
  let scheduler: AuctionScheduler;
  let auctionStartQueue: DeepMocked<Queue>;
  let auctionEndQueue: DeepMocked<Queue>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuctionScheduler,
        {
          provide: getQueueToken(AUCTION_START_QUEUE),
          useValue: createMock<Queue>(),
        },
        {
          provide: getQueueToken(AUCTION_END_QUEUE),
          useValue: createMock<Queue>(),
        },
      ],
    }).compile();

    scheduler = module.get<AuctionScheduler>(AuctionScheduler);
    auctionStartQueue = module.get(getQueueToken(AUCTION_START_QUEUE));
    auctionEndQueue = module.get(getQueueToken(AUCTION_END_QUEUE));

    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(scheduler).toBeDefined();
  });

  describe('scheduleAuctionStart', () => {
    it('should add a delayed job to the start queue with the correct payload and options', async () => {
      const auctionId = 1;
      const startsAt = new Date(Date.now() + 3600000);

      await scheduler.scheduleAuctionStart(auctionId, startsAt);

      expect(auctionStartQueue.add).toHaveBeenCalledWith(
        'start-auction',
        { auctionId },
        expect.objectContaining({
          delay: expect.any(Number) as number,
          jobId: `${AUCTION_START_QUEUE}-${auctionId}`,
          removeOnComplete: true,
          removeOnFail: false,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        }),
      );
    });

    it('should calculate delay relative to current time', async () => {
      const delayMs = 5000;
      const startsAt = new Date(Date.now() + delayMs);

      await scheduler.scheduleAuctionStart(1, startsAt);

      const [, , options] = auctionStartQueue.add.mock.calls[0];
      expect(options!.delay).toBeGreaterThan(0);
      expect(options!.delay).toBeLessThanOrEqual(delayMs);
    });

    it('should clamp delay to 0 and warn when startsAt is in the past', async () => {
      const startsAt = new Date(Date.now() - 60000);

      await scheduler.scheduleAuctionStart(1, startsAt);

      const [, , options] = auctionStartQueue.add.mock.calls[0];
      expect(options!.delay).toBe(0);
      expect(Logger.prototype.warn).toHaveBeenCalledWith('Auction 1 start time is in the past — starting immediately');
    });

    it('should use a predictable jobId based on auctionId', async () => {
      await scheduler.scheduleAuctionStart(42, new Date(Date.now() + 1000));

      const [, , options] = auctionStartQueue.add.mock.calls[0];
      expect(options!.jobId).toBe(`${AUCTION_START_QUEUE}-42`);
    });

    it('should log confirmation after successfully adding the job', async () => {
      await scheduler.scheduleAuctionStart(1, new Date(Date.now() + 3600000));

      expect(Logger.prototype.log).toHaveBeenCalledWith(expect.stringContaining('Auction 1 start scheduled'));
    });

    it('should propagate errors thrown by the queue', async () => {
      auctionStartQueue.add.mockRejectedValue(new Error('BullMQ unavailable'));

      await expect(scheduler.scheduleAuctionStart(1, new Date(Date.now() + 1000))).rejects.toThrow('BullMQ unavailable');
    });
  });

  describe('cancelAuctionStart', () => {
    it('should remove the job when it exists in the queue', async () => {
      const mockJob = createMock<Job>();
      auctionStartQueue.getJob.mockResolvedValue(mockJob);

      await scheduler.cancelAuctionStart(1);

      expect(auctionStartQueue.getJob).toHaveBeenCalledWith(`${AUCTION_START_QUEUE}-1`);
      expect(mockJob.remove).toHaveBeenCalled();
      expect(Logger.prototype.log).toHaveBeenCalledWith('Auction 1 start job cancelled');
    });

    it('should do nothing silently when the job does not exist', async () => {
      auctionStartQueue.getJob.mockResolvedValue(undefined);

      await scheduler.cancelAuctionStart(99);

      expect(auctionStartQueue.getJob).toHaveBeenCalledWith(`${AUCTION_START_QUEUE}-99`);
      expect(Logger.prototype.log).not.toHaveBeenCalledWith(expect.stringContaining('job cancelled'));
    });

    it('should propagate errors thrown by getJob', async () => {
      auctionStartQueue.getJob.mockRejectedValue(new Error('Redis connection lost'));

      await expect(scheduler.cancelAuctionStart(1)).rejects.toThrow('Redis connection lost');
    });
  });

  describe('scheduleAuctionEnd', () => {
    it('should add a delayed job to the end queue with the correct payload and options', async () => {
      const auctionId = 5;
      const endsAt = new Date(Date.now() + 7200000);

      await scheduler.scheduleAuctionEnd(auctionId, endsAt);

      expect(auctionEndQueue.add).toHaveBeenCalledWith(
        'end-auction',
        { auctionId },
        expect.objectContaining({
          delay: expect.any(Number) as number,
          jobId: `${AUCTION_END_QUEUE}-${auctionId}`,
          removeOnComplete: true,
          removeOnFail: false,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        }),
      );
    });

    it('should calculate delay relative to current time', async () => {
      const delayMs = 10000;
      const endsAt = new Date(Date.now() + delayMs);

      await scheduler.scheduleAuctionEnd(5, endsAt);

      const [, , options] = auctionEndQueue.add.mock.calls[0];
      expect(options!.delay).toBeGreaterThan(0);
      expect(options!.delay).toBeLessThanOrEqual(delayMs);
    });

    it('should clamp delay to 0 and warn when endsAt is in the past', async () => {
      const endsAt = new Date(Date.now() - 60000);

      await scheduler.scheduleAuctionEnd(5, endsAt);

      const [, , options] = auctionEndQueue.add.mock.calls[0];
      expect(options!.delay).toBe(0);
      expect(Logger.prototype.warn).toHaveBeenCalledWith('Auction 5 end time is in the past — ending immediately');
    });

    it('should use a predictable jobId based on auctionId', async () => {
      await scheduler.scheduleAuctionEnd(10, new Date(Date.now() + 1000));

      const [, , options] = auctionEndQueue.add.mock.calls[0];
      expect(options!.jobId).toBe(`${AUCTION_END_QUEUE}-10`);
    });

    it('should log confirmation after successfully adding the job', async () => {
      await scheduler.scheduleAuctionEnd(5, new Date(Date.now() + 3600000));

      expect(Logger.prototype.log).toHaveBeenCalledWith(expect.stringContaining('Auction 5 end scheduled'));
    });

    it('should propagate errors thrown by the queue', async () => {
      auctionEndQueue.add.mockRejectedValue(new Error('BullMQ unavailable'));

      await expect(scheduler.scheduleAuctionEnd(5, new Date(Date.now() + 1000))).rejects.toThrow('BullMQ unavailable');
    });
  });

  describe('cancelAuctionEnd', () => {
    it('should remove the job when it exists in the queue', async () => {
      const mockJob = createMock<Job>();
      auctionEndQueue.getJob.mockResolvedValue(mockJob);

      await scheduler.cancelAuctionEnd(5);

      expect(auctionEndQueue.getJob).toHaveBeenCalledWith(`${AUCTION_END_QUEUE}-5`);
      expect(mockJob.remove).toHaveBeenCalled();
      expect(Logger.prototype.log).toHaveBeenCalledWith('Auction 5 end job cancelled');
    });

    it('should do nothing silently when the job does not exist', async () => {
      auctionEndQueue.getJob.mockResolvedValue(undefined);

      await scheduler.cancelAuctionEnd(99);

      expect(auctionEndQueue.getJob).toHaveBeenCalledWith(`${AUCTION_END_QUEUE}-99`);
      expect(Logger.prototype.log).not.toHaveBeenCalledWith(expect.stringContaining('job cancelled'));
    });

    it('should propagate errors thrown by getJob', async () => {
      auctionEndQueue.getJob.mockRejectedValue(new Error('Redis connection lost'));

      await expect(scheduler.cancelAuctionEnd(5)).rejects.toThrow('Redis connection lost');
    });
  });
});
