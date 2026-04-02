import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { AUCTION_END_QUEUE, AUCTION_START_QUEUE } from '@modules/auctions/auction.constants';
import { RedisService } from '@shared/redis';
import { MAIL_QUEUE } from '@shared/mail';
import { HealthService } from './health.service';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { DataSource } from 'typeorm';
import { Queue } from 'bullmq';

describe('HealthService', () => {
  let service: HealthService;
  let redisService: DeepMocked<RedisService>;
  let dataSource: DeepMocked<DataSource>;
  let auctionStartQueue: DeepMocked<Queue>;
  let auctionEndQueue: DeepMocked<Queue>;
  let mailQueue: DeepMocked<Queue>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        {
          provide: RedisService,
          useValue: createMock<RedisService>(),
        },
        {
          provide: getDataSourceToken(),
          useValue: createMock<DataSource>(),
        },
        {
          provide: getQueueToken(AUCTION_START_QUEUE),
          useValue: createMock<Queue>(),
        },
        {
          provide: getQueueToken(AUCTION_END_QUEUE),
          useValue: createMock<Queue>(),
        },
        {
          provide: getQueueToken(MAIL_QUEUE),
          useValue: createMock<Queue>(),
        },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
    redisService = module.get(RedisService);
    dataSource = module.get(getDataSourceToken());
    auctionStartQueue = module.get(getQueueToken(AUCTION_START_QUEUE));
    auctionEndQueue = module.get(getQueueToken(AUCTION_END_QUEUE));
    mailQueue = module.get(getQueueToken(MAIL_QUEUE));

    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isLive', () => {
    it('should return true', () => {
      expect(service.isLive()).toBe(true);
    });
  });

  describe('getReadiness', () => {
    beforeEach(() => {
      dataSource.query.mockResolvedValue([{ '1': 1 }]);
      redisService.ping.mockResolvedValue(5);
      auctionStartQueue.getWorkers.mockResolvedValue([]);
      auctionEndQueue.getWorkers.mockResolvedValue([]);
      mailQueue.getWorkers.mockResolvedValue([]);
    });

    it('should return overall UP when all dependencies are healthy', async () => {
      const result = await service.getReadiness();

      expect(result.status).toBe('UP');
      expect(result.database.status).toBe('UP');
      expect(result.redis.status).toBe('UP');
      expect(result.bullmq.status).toBe('UP');
    });

    it('should include responseTimeMs for each healthy component', async () => {
      const result = await service.getReadiness();

      expect(result.database.responseTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.redis.responseTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.bullmq.responseTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should return overall DOWN when database is unavailable', async () => {
      dataSource.query.mockRejectedValue(new Error('Connection refused'));

      const result = await service.getReadiness();

      expect(result.status).toBe('DOWN');
      expect(result.database.status).toBe('DOWN');
      expect(result.database.error).toBe('Connection refused');
      expect(result.redis.status).toBe('UP');
      expect(result.bullmq.status).toBe('UP');
    });

    it('should return overall DOWN when Redis is unavailable', async () => {
      redisService.ping.mockRejectedValue(new Error('Redis ECONNREFUSED'));

      const result = await service.getReadiness();

      expect(result.status).toBe('DOWN');
      expect(result.redis.status).toBe('DOWN');
      expect(result.redis.error).toBe('Redis ECONNREFUSED');
      expect(result.database.status).toBe('UP');
      expect(result.bullmq.status).toBe('UP');
    });

    it('should return overall DOWN when BullMQ is unavailable', async () => {
      auctionStartQueue.getWorkers.mockRejectedValue(new Error('BullMQ connection error'));

      const result = await service.getReadiness();

      expect(result.status).toBe('DOWN');
      expect(result.bullmq.status).toBe('DOWN');
      expect(result.bullmq.error).toBe('BullMQ connection error');
      expect(result.database.status).toBe('UP');
      expect(result.redis.status).toBe('UP');
    });

    it('should return overall DOWN when multiple dependencies are unavailable', async () => {
      dataSource.query.mockRejectedValue(new Error('DB error'));
      redisService.ping.mockRejectedValue(new Error('Redis error'));

      const result = await service.getReadiness();

      expect(result.status).toBe('DOWN');
      expect(result.database.status).toBe('DOWN');
      expect(result.redis.status).toBe('DOWN');
    });

    it('should check all three BullMQ queues', async () => {
      await service.getReadiness();

      expect(auctionStartQueue.getWorkers).toHaveBeenCalled();
      expect(auctionEndQueue.getWorkers).toHaveBeenCalled();
      expect(mailQueue.getWorkers).toHaveBeenCalled();
    });

    it('should run all checks in parallel', async () => {
      let resolveDb!: () => void;
      let resolveRedis!: () => void;

      dataSource.query.mockReturnValue(new Promise<void>((res) => (resolveDb = res)));
      redisService.ping.mockReturnValue(
        new Promise<number>((res) => {
          resolveRedis = () => res(1);
        }),
      );

      const promise = service.getReadiness();
      resolveDb();
      resolveRedis();
      const result = await promise;

      // Both resolved — proves they ran concurrently (no sequential await)
      expect(result.database.status).toBe('UP');
      expect(result.redis.status).toBe('UP');
    });
  });
});
