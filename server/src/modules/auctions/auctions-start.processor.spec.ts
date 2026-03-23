import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { createAuctionFixture } from '@test/fixtures/auctions.fixtures';
import { Bid } from '@modules/bid';
import { RedisService } from '@shared/redis';
import { AuctionStartProcessor } from './auctions-start.processor';
import { AuctionScheduler } from './auction.scheduler';
import { IAuctionJob } from './interfaces';
import { AuctionStatus } from './enums';
import { Auction } from './entities';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { Job } from 'bullmq';

describe('AuctionStartProcessor', () => {
  let processor: AuctionStartProcessor;
  let auctionRepository: DeepMocked<Repository<Auction>>;
  let bidRepository: DeepMocked<Repository<Bid>>;
  let redisService: DeepMocked<RedisService>;
  let auctionScheduler: DeepMocked<AuctionScheduler>;
  let dataSource: DeepMocked<DataSource>;

  const createJob = (auctionId: number): Job<IAuctionJob> => ({ data: { auctionId } }) as unknown as Job<IAuctionJob>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuctionStartProcessor,
        {
          provide: getRepositoryToken(Auction),
          useValue: createMock<Repository<Auction>>(),
        },
        {
          provide: getRepositoryToken(Bid),
          useValue: createMock<Repository<Bid>>(),
        },
        {
          provide: RedisService,
          useValue: createMock<RedisService>(),
        },
        {
          provide: AuctionScheduler,
          useValue: createMock<AuctionScheduler>(),
        },
        {
          provide: DataSource,
          useValue: createMock<DataSource>(),
        },
      ],
    }).compile();

    processor = module.get<AuctionStartProcessor>(AuctionStartProcessor);
    auctionRepository = module.get(getRepositoryToken(Auction));
    bidRepository = module.get(getRepositoryToken(Bid));
    redisService = module.get(RedisService);
    auctionScheduler = module.get(AuctionScheduler);
    dataSource = module.get(DataSource);

    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('onApplicationBootstrap', () => {
    it('should do nothing when there are no active auctions in the database', async () => {
      auctionRepository.find.mockResolvedValue([]);

      await processor.onApplicationBootstrap();

      expect(redisService.isAuctionActive).not.toHaveBeenCalled();
      expect(redisService.restoreAuction).not.toHaveBeenCalled();
      expect(redisService.initializeAuction).not.toHaveBeenCalled();
    });

    it('should skip an active auction that already exists in Redis', async () => {
      const auction = createAuctionFixture({ status: AuctionStatus.ACTIVE });
      auctionRepository.find.mockResolvedValue([auction]);
      redisService.isAuctionActive.mockResolvedValue(true);

      await processor.onApplicationBootstrap();

      expect(redisService.restoreAuction).not.toHaveBeenCalled();
      expect(auctionRepository.update).not.toHaveBeenCalled();
    });

    it('should mark auction as ENDED when it is not in Redis and its endTime is already in the past', async () => {
      const pastEndTime = new Date(Date.now() - 60000);
      const auction = createAuctionFixture({
        id: 1,
        status: AuctionStatus.ACTIVE,
        endTime: pastEndTime,
      });
      auctionRepository.find.mockResolvedValue([auction]);
      redisService.isAuctionActive.mockResolvedValue(false);

      await processor.onApplicationBootstrap();

      expect(auctionRepository.update).toHaveBeenCalledWith(
        auction.id,
        expect.objectContaining({
          status: AuctionStatus.ENDED,
          endedAt: expect.any(Date) as unknown as Date,
        }),
      );
      expect(redisService.restoreAuction).not.toHaveBeenCalled();
    });

    it('should restore auction in Redis and schedule end job when auction is not in Redis but still valid', async () => {
      const futureEndTime = new Date(Date.now() + 60000);
      const auction = createAuctionFixture({
        id: 1,
        status: AuctionStatus.ACTIVE,
        endTime: futureEndTime,
        currentPrice: 200,
        startingPrice: 100,
        ownerId: 5,
      });
      auctionRepository.find.mockResolvedValue([auction]);
      redisService.isAuctionActive.mockResolvedValue(false);
      bidRepository.findOne.mockResolvedValue(null);

      await processor.onApplicationBootstrap();

      expect(redisService.restoreAuction).toHaveBeenCalledWith(auction.id, 200, expect.any(Number) as unknown as number, auction.ownerId, null);
      expect(auctionScheduler.scheduleAuctionEnd).toHaveBeenCalledWith(auction.id, futureEndTime);
    });

    it('should use startingPrice when currentPrice is null during restoration', async () => {
      const futureEndTime = new Date(Date.now() + 60000);
      const auction = createAuctionFixture({
        id: 2,
        status: AuctionStatus.ACTIVE,
        endTime: futureEndTime,
        currentPrice: null as unknown as number,
        startingPrice: 150,
        ownerId: 3,
      });
      auctionRepository.find.mockResolvedValue([auction]);
      redisService.isAuctionActive.mockResolvedValue(false);
      bidRepository.findOne.mockResolvedValue(null);

      await processor.onApplicationBootstrap();

      expect(redisService.restoreAuction).toHaveBeenCalledWith(auction.id, 150, expect.any(Number) as unknown as number, auction.ownerId, null);
    });

    it('should pass highest bidder userId when a bid exists for the auction', async () => {
      const futureEndTime = new Date(Date.now() + 60000);
      const auction = createAuctionFixture({
        id: 3,
        status: AuctionStatus.ACTIVE,
        endTime: futureEndTime,
        ownerId: 1,
      });
      const highestBid = { auctionId: 3, userId: 42, amount: 300 } as Bid;
      auctionRepository.find.mockResolvedValue([auction]);
      redisService.isAuctionActive.mockResolvedValue(false);
      bidRepository.findOne.mockResolvedValue(highestBid);

      await processor.onApplicationBootstrap();

      expect(bidRepository.findOne).toHaveBeenCalledWith({
        where: { auctionId: auction.id },
        order: { amount: 'DESC' },
      });
      expect(redisService.restoreAuction).toHaveBeenCalledWith(auction.id, expect.any(Number) as unknown as number, expect.any(Number) as unknown as number, auction.ownerId, 42);
    });

    it('should log error and not throw when reconciliation fails', async () => {
      const dbError = new Error('DB connection lost');
      auctionRepository.find.mockRejectedValue(dbError);

      await expect(processor.onApplicationBootstrap()).resolves.not.toThrow();

      expect(Logger.prototype.error).toHaveBeenCalledWith('Reconciliation failed on bootstrap', dbError.stack);
    });

    it('should handle multiple auctions and reconcile only those missing from Redis', async () => {
      const futureEndTime = new Date(Date.now() + 60000);
      const auctionInRedis = createAuctionFixture({ id: 1, status: AuctionStatus.ACTIVE, endTime: futureEndTime });
      const auctionMissing = createAuctionFixture({ id: 2, status: AuctionStatus.ACTIVE, endTime: futureEndTime });

      auctionRepository.find.mockResolvedValue([auctionInRedis, auctionMissing]);
      redisService.isAuctionActive.mockImplementation((id: number) => Promise.resolve(id === 1));
      bidRepository.findOne.mockResolvedValue(null);

      await processor.onApplicationBootstrap();

      expect(redisService.restoreAuction).toHaveBeenCalledTimes(1);
      expect(redisService.restoreAuction).toHaveBeenCalledWith(
        auctionMissing.id,
        expect.any(Number) as unknown as number,
        expect.any(Number) as unknown as number,
        auctionMissing.ownerId,
        null,
      );
    });
  });

  describe('process', () => {
    it('should skip and warn when auction does not exist in the database', async () => {
      auctionRepository.findOneBy.mockResolvedValue(null);

      await processor.process(createJob(99));

      expect(Logger.prototype.warn).toHaveBeenCalledWith('Auction 99 not found — skipping');
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(redisService.initializeAuction).not.toHaveBeenCalled();
    });

    it('should skip and warn when auction status is not PENDING', async () => {
      const activeAuction = createAuctionFixture({ id: 1, status: AuctionStatus.ACTIVE });
      auctionRepository.findOneBy.mockResolvedValue(activeAuction);

      await processor.process(createJob(1));

      expect(Logger.prototype.warn).toHaveBeenCalledWith(`Auction 1 is not PENDING (status: ${AuctionStatus.ACTIVE}) — skipping`);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('should mark auction as ENDED and skip activation when endTime is already in the past', async () => {
      const pastEndTime = new Date(Date.now() - 60000);
      const pendingAuction = createAuctionFixture({
        id: 1,
        status: AuctionStatus.PENDING,
        endTime: pastEndTime,
      });
      auctionRepository.findOneBy.mockResolvedValue(pendingAuction);

      await processor.process(createJob(1));

      expect(auctionRepository.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          status: AuctionStatus.ENDED,
          endedAt: expect.any(Date) as unknown as Date,
        }),
      );
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(redisService.initializeAuction).not.toHaveBeenCalled();
    });

    it('should start auction successfully: update DB, initialize Redis, and schedule end job', async () => {
      const futureEndTime = new Date(Date.now() + 3600000);
      const pendingAuction = createAuctionFixture({
        id: 1,
        status: AuctionStatus.PENDING,
        endTime: futureEndTime,
        startingPrice: 100,
        ownerId: 5,
      });
      auctionRepository.findOneBy.mockResolvedValue(pendingAuction);

      dataSource.transaction.mockImplementation(async (arg1: unknown, arg2?: unknown) => {
        const cb = (arg2 || arg1) as (em: EntityManager) => Promise<boolean>;

        const mockEm = createMock<EntityManager>();
        mockEm.findOne.mockResolvedValue({ ...pendingAuction, status: AuctionStatus.PENDING });
        mockEm.update.mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });

        return cb(mockEm);
      });

      await processor.process(createJob(1));

      expect(dataSource.transaction).toHaveBeenCalled();
      expect(redisService.initializeAuction).toHaveBeenCalledWith(1, 100, expect.any(Number) as unknown as number, 5);
      expect(auctionScheduler.scheduleAuctionEnd).toHaveBeenCalledWith(1, futureEndTime);
      expect(Logger.prototype.log).toHaveBeenCalledWith(expect.stringContaining('Auction 1 started'));
    });

    it('should not initialize Redis or schedule end job when the pessimistic lock reveals a non-PENDING status', async () => {
      const futureEndTime = new Date(Date.now() + 3600000);
      const pendingAuction = createAuctionFixture({
        id: 1,
        status: AuctionStatus.PENDING,
        endTime: futureEndTime,
      });
      auctionRepository.findOneBy.mockResolvedValue(pendingAuction);

      dataSource.transaction.mockImplementation(async (arg1: unknown, arg2?: unknown) => {
        const cb = (arg2 || arg1) as (em: EntityManager) => Promise<boolean>;

        const mockEm = createMock<EntityManager>();
        mockEm.findOne.mockResolvedValue({ ...pendingAuction, status: AuctionStatus.ACTIVE });

        return cb(mockEm);
      });

      await processor.process(createJob(1));

      expect(redisService.initializeAuction).not.toHaveBeenCalled();
      expect(auctionScheduler.scheduleAuctionEnd).not.toHaveBeenCalled();
    });

    it('should not initialize Redis or schedule end job when the locked auction is not found', async () => {
      const futureEndTime = new Date(Date.now() + 3600000);
      const pendingAuction = createAuctionFixture({ id: 1, status: AuctionStatus.PENDING, endTime: futureEndTime });
      auctionRepository.findOneBy.mockResolvedValue(pendingAuction);

      dataSource.transaction.mockImplementation(async (arg1: unknown, arg2?: unknown) => {
        const cb = (arg2 || arg1) as (em: EntityManager) => Promise<boolean>;

        const mockEm = createMock<EntityManager>();
        mockEm.findOne.mockResolvedValue(null);

        return cb(mockEm);
      });

      await processor.process(createJob(1));

      expect(redisService.initializeAuction).not.toHaveBeenCalled();
      expect(auctionScheduler.scheduleAuctionEnd).not.toHaveBeenCalled();
    });

    it('should correctly calculate durationSeconds based on endTime and current time', async () => {
      const delayMs = 7200000;
      const futureEndTime = new Date(Date.now() + delayMs);
      const pendingAuction = createAuctionFixture({
        id: 1,
        status: AuctionStatus.PENDING,
        endTime: futureEndTime,
        startingPrice: 50,
        ownerId: 7,
      });
      auctionRepository.findOneBy.mockResolvedValue(pendingAuction);

      dataSource.transaction.mockImplementation(async (arg1: unknown, arg2?: unknown) => {
        const cb = (arg2 || arg1) as (em: EntityManager) => Promise<boolean>;

        const mockEm = createMock<EntityManager>();
        mockEm.findOne.mockResolvedValue({ ...pendingAuction });
        mockEm.update.mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });

        return cb(mockEm);
      });

      await processor.process(createJob(1));

      const callArgs = redisService.initializeAuction.mock.calls[0] as [number, number, number, number];
      const durationSeconds = callArgs[2];

      expect(durationSeconds).toBeGreaterThan(7100);
      expect(durationSeconds).toBeLessThanOrEqual(7200);
    });

    it('should propagate errors thrown during the database transaction', async () => {
      const futureEndTime = new Date(Date.now() + 3600000);
      const pendingAuction = createAuctionFixture({ id: 1, status: AuctionStatus.PENDING, endTime: futureEndTime });
      auctionRepository.findOneBy.mockResolvedValue(pendingAuction);

      const dbError = new Error('Transaction failed');
      dataSource.transaction.mockRejectedValue(dbError);

      await expect(processor.process(createJob(1))).rejects.toThrow('Transaction failed');
      expect(redisService.initializeAuction).not.toHaveBeenCalled();
    });
  });
});
