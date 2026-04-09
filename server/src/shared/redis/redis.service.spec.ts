import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from './redis.service';
import { REDIS_CLIENT, SOCKET_AUCTION_TTL } from './redis.constants';
import Redis from 'ioredis';

describe('RedisService', () => {
  let service: RedisService;
  let mockRedis: jest.Mocked<Redis>;

  beforeEach(async () => {
    mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      exists: jest.fn(),
      scan: jest.fn(),
      ttl: jest.fn(),
      hdel: jest.fn(),
      hlen: jest.fn(),
      hset: jest.fn(),
      expire: jest.fn(),
      pipeline: jest.fn(),
      defineCommand: jest.fn(),
      disconnect: jest.fn(),
      placeBidAtomicCommand: jest.fn(),
    } as unknown as jest.Mocked<Redis>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        {
          provide: REDIS_CLIENT,
          useValue: mockRedis,
        },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
    jest.spyOn(service['logger'], 'error').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('should define Lua command and log success on startup', () => {
      jest.spyOn(service['logger'], 'log').mockImplementation();

      service.onModuleInit();

      expect(mockRedis.defineCommand).toHaveBeenCalledWith('placeBidAtomicCommand', {
        numberOfKeys: 3,
        lua: expect.any(String) as string,
      });
      expect(service['logger'].log).toHaveBeenCalledWith('Redis Lua scripts loaded.');
    });

    it('should not throw if defineCommand succeeds', () => {
      expect(() => service.onModuleInit()).not.toThrow();
    });
  });

  describe('getCache', () => {
    it('should return parsed data when key exists', async () => {
      const key = 'test-key';
      const expectedData = { id: 1, name: 'Test' };
      const jsonData = JSON.stringify(expectedData);

      mockRedis.get.mockResolvedValue(jsonData);

      const result = await service.getCache<typeof expectedData>(key);

      expect(result).toEqual(expectedData);
      expect(mockRedis.get).toHaveBeenCalledWith(key);
    });

    it('should return null when key does not exist', async () => {
      const key = 'non-existent-key';

      mockRedis.get.mockResolvedValue(null);

      const result = await service.getCache<unknown>(key);

      expect(result).toBeNull();
      expect(mockRedis.get).toHaveBeenCalledWith(key);
    });

    it('should return null and log error when JSON parsing fails', async () => {
      const key = 'invalid-json-key';
      const invalidJson = '{invalid json}';

      mockRedis.get.mockResolvedValue(invalidJson);

      const result = await service.getCache<unknown>(key);

      expect(result).toBeNull();
      expect(service['logger'].error).toHaveBeenCalled();
    });

    it('should return null and log error when Redis get fails', async () => {
      const key = 'test-key';
      const error = new Error('Redis connection failed');

      mockRedis.get.mockRejectedValue(error);

      const result = await service.getCache<unknown>(key);

      expect(result).toBeNull();
      expect(service['logger'].error).toHaveBeenCalledWith(expect.stringContaining('Cache get error'), expect.any(String));
    });

    it('should return correctly typed data using generic', async () => {
      interface User {
        id: number;
        email: string;
      }

      const key = 'user:1';
      const user: User = { id: 1, email: 'test@example.com' };

      mockRedis.get.mockResolvedValue(JSON.stringify(user));

      const result = await service.getCache<User>(key);

      expect(result).toEqual(user);
      expect(result?.email).toBeDefined();
    });

    it('should handle non-Error objects thrown as errors', async () => {
      const key = 'test-key';

      mockRedis.get.mockRejectedValue('String error');

      const result = await service.getCache<unknown>(key);

      expect(result).toBeNull();
      expect(service['logger'].error).toHaveBeenCalled();
    });
  });

  describe('setCache', () => {
    it('should successfully set cache with TTL', async () => {
      const key = 'test-key';
      const value = { id: 1, name: 'Test' };
      const ttlSeconds = 3600;

      mockRedis.set.mockResolvedValue('OK');

      await service.setCache(key, value, ttlSeconds);

      expect(mockRedis.set).toHaveBeenCalledWith(key, JSON.stringify(value), 'EX', ttlSeconds);
    });

    it('should handle null value', async () => {
      mockRedis.set.mockResolvedValue('OK');

      await service.setCache('null-key', null, 3600);

      expect(mockRedis.set).toHaveBeenCalledWith('null-key', 'null', 'EX', 3600);
    });

    it('should handle undefined value', async () => {
      mockRedis.set.mockResolvedValue('OK');

      await service.setCache('undefined-key', undefined, 3600);

      expect(mockRedis.set).toHaveBeenCalledWith('undefined-key', undefined, 'EX', 3600);
    });

    it('should log error when Redis set fails', async () => {
      const key = 'test-key';
      const value = { id: 1 };
      const ttlSeconds = 3600;
      const error = new Error('Redis set failed');

      mockRedis.set.mockRejectedValue(error);

      await service.setCache(key, value, ttlSeconds);

      expect(service['logger'].error).toHaveBeenCalledWith(expect.stringContaining('Cache set error'), expect.any(String));
    });

    it('should handle non-Error objects thrown as errors', async () => {
      const key = 'test-key';
      const value = { id: 1 };
      const ttlSeconds = 3600;

      mockRedis.set.mockRejectedValue('String error');

      await service.setCache(key, value, ttlSeconds);

      expect(service['logger'].error).toHaveBeenCalled();
    });
  });

  describe('deleteCache', () => {
    it('should successfully delete cache key', async () => {
      const key = 'test-key';

      mockRedis.del.mockResolvedValue(1);

      await service.deleteCache(key);

      expect(mockRedis.del).toHaveBeenCalledWith(key);
    });

    it('should handle deletion of non-existent key', async () => {
      const key = 'non-existent-key';

      mockRedis.del.mockResolvedValue(0);

      await service.deleteCache(key);

      expect(mockRedis.del).toHaveBeenCalledWith(key);
    });

    it('should log error when Redis delete fails', async () => {
      const key = 'test-key';
      const error = new Error('Redis delete failed');

      mockRedis.del.mockRejectedValue(error);

      await service.deleteCache(key);

      expect(service['logger'].error).toHaveBeenCalledWith(expect.stringContaining('Cache delete error'), expect.any(String));
    });

    it('should handle non-Error objects thrown as errors', async () => {
      const key = 'test-key';

      mockRedis.del.mockRejectedValue('String error');

      await service.deleteCache(key);

      expect(service['logger'].error).toHaveBeenCalled();
    });
  });

  describe('onModuleDestroy', () => {
    it('should disconnect Redis connection', () => {
      service.onModuleDestroy();

      expect(mockRedis.disconnect).toHaveBeenCalled();
    });
  });

  describe('invalidateCache', () => {
    it('should scan and delete all matching keys', async () => {
      mockRedis.scan.mockResolvedValueOnce(['0', ['key:1', 'key:2']]).mockResolvedValueOnce(['0', []]);

      (mockRedis.del as jest.Mock).mockResolvedValue(2);
      jest.spyOn(service['logger'], 'log').mockImplementation();

      await service.invalidateCache('key:*');

      expect(mockRedis.scan).toHaveBeenCalledWith('0', 'MATCH', 'key:*', 'COUNT', 100);
      expect(mockRedis.del).toHaveBeenCalledWith('key:1', 'key:2');
      expect(service['logger'].log).toHaveBeenCalledWith(expect.stringContaining('Invalidated 2 keys'));
    });

    it('should paginate through cursor until cursor returns to "0"', async () => {
      mockRedis.scan.mockResolvedValueOnce(['42', ['key:1']]).mockResolvedValueOnce(['0', ['key:2']]);

      (mockRedis.del as jest.Mock).mockResolvedValue(1);

      await service.invalidateCache('key:*');

      expect(mockRedis.scan).toHaveBeenCalledTimes(2);
      expect(mockRedis.del).toHaveBeenCalledTimes(2);
    });

    it('should not call del and not log when no keys match the pattern', async () => {
      mockRedis.scan.mockResolvedValueOnce(['0', []]);
      jest.spyOn(service['logger'], 'log').mockImplementation();

      await service.invalidateCache('no-match:*');

      expect(mockRedis.del).not.toHaveBeenCalled();
      expect(service['logger'].log).not.toHaveBeenCalled();
    });

    it('should log error and not throw when scan fails', async () => {
      mockRedis.scan.mockRejectedValue(new Error('SCAN failed'));

      await expect(service.invalidateCache('key:*')).resolves.not.toThrow();

      expect(service['logger'].error).toHaveBeenCalledWith(expect.stringContaining('Cache invalidation error'), expect.any(String));
    });
  });

  describe('getLivePrice', () => {
    it('should return parsed float price when key exists', async () => {
      mockRedis.get.mockResolvedValue('250.5');

      const result = await service.getLivePrice(1);

      expect(result).toBe(250.5);
      expect(mockRedis.get).toHaveBeenCalledWith('auction:1:price');
    });

    it('should return null when key does not exist', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await service.getLivePrice(1);

      expect(result).toBeNull();
    });

    it('should return null and log error when Redis fails', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis error'));

      const result = await service.getLivePrice(1);

      expect(result).toBeNull();
      expect(service['logger'].error).toHaveBeenCalledWith(expect.stringContaining('Get live price error'), expect.any(String));
    });
  });

  describe('isAuctionActive', () => {
    it('should return true when the active key exists (exists === 1)', async () => {
      (mockRedis.exists as jest.Mock).mockResolvedValue(1);

      const result = await service.isAuctionActive(1);

      expect(result).toBe(true);
      expect(mockRedis.exists).toHaveBeenCalledWith('auction:1:active');
    });

    it('should return false when the active key does not exist (exists === 0)', async () => {
      (mockRedis.exists as jest.Mock).mockResolvedValue(0);

      const result = await service.isAuctionActive(1);

      expect(result).toBe(false);
    });

    it('should return false and log error when Redis fails', async () => {
      (mockRedis.exists as jest.Mock).mockRejectedValue(new Error('Redis error'));

      const result = await service.isAuctionActive(1);

      expect(result).toBe(false);
      expect(service['logger'].error).toHaveBeenCalledWith(expect.stringContaining('Check auction active error'), expect.any(String));
    });
  });

  describe('initializeAuction', () => {
    let mockTransaction: {
      set: jest.Mock;
      exec: jest.Mock;
    };

    beforeEach(() => {
      mockTransaction = {
        set: jest.fn().mockReturnThis(),
        exec: jest.fn(),
      };

      mockRedis.multi = jest.fn().mockReturnValue(mockTransaction as unknown as ReturnType<typeof mockRedis.multi>);

      jest.spyOn(service['logger'], 'log').mockImplementation();
      jest.spyOn(service['logger'], 'warn').mockImplementation();
      jest.spyOn(service as any, 'handleError').mockImplementation();
    });

    it('should set active, price, and owner keys using multi/exec with NX flag and correct TTLs', async () => {
      mockTransaction.exec.mockResolvedValue([
        [null, 'OK'],
        [null, 'OK'],
        [null, 'OK'],
      ]);

      await service.initializeAuction(1, 100, 3600, 5);

      expect(mockRedis.multi).toHaveBeenCalled();
      expect(mockTransaction.set).toHaveBeenCalledWith('auction:1:active', '1', 'EX', 3600, 'NX');
      expect(mockTransaction.set).toHaveBeenCalledWith('auction:1:price', '100', 'EX', 7200, 'NX');
      expect(mockTransaction.set).toHaveBeenCalledWith('auction:1:owner', '5', 'EX', 7200, 'NX');

      expect(mockTransaction.exec).toHaveBeenCalled();
      expect(service['logger'].log).toHaveBeenCalledWith(expect.stringContaining('Auction 1 initialized'));
    });

    it('should log a warning and return early if auction is already active (idempotent retry)', async () => {
      mockTransaction.exec.mockResolvedValue([
        [null, null],
        [null, null],
        [null, null],
      ]);

      await service.initializeAuction(1, 100, 3600, 5);

      expect(mockTransaction.exec).toHaveBeenCalled();
      expect(service['logger'].warn).toHaveBeenCalledWith(expect.stringContaining('already initialized in Redis'));
      expect(service['logger'].log).not.toHaveBeenCalled();
    });

    it('should catch pipeline-specific errors and trigger handleError', async () => {
      const pipelineError = new Error('Command rejected by Redis');
      mockTransaction.exec.mockResolvedValue([
        [null, 'OK'],
        [pipelineError, null],
        [null, 'OK'],
      ]);

      await service.initializeAuction(1, 100, 3600, 5);

      expect(service['handleError']).toHaveBeenCalledWith(expect.stringContaining('Initialize auction error for ID "1"'), expect.any(Error));
      expect(service['logger'].log).not.toHaveBeenCalled();
    });

    it('should log error and not throw when Redis completely fails to execute the transaction', async () => {
      mockTransaction.exec.mockRejectedValue(new Error('Redis connection lost'));

      await expect(service.initializeAuction(1, 100, 3600, 5)).resolves.not.toThrow();

      expect(service['handleError']).toHaveBeenCalledWith(expect.stringContaining('Initialize auction error for ID "1"'), expect.any(Error));
    });
  });

  describe('extendAuctionTime', () => {
    it('should call expire on all 4 keys via pipeline and log confirmation', async () => {
      const mockPipeline = {
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      };
      (mockRedis.pipeline as jest.Mock).mockReturnValue(mockPipeline);
      jest.spyOn(service['logger'], 'log').mockImplementation();

      await service.extendAuctionTime(1, 1800);

      expect(mockPipeline.expire).toHaveBeenCalledWith('auction:1:price', 5400);
      expect(mockPipeline.expire).toHaveBeenCalledWith('auction:1:active', 1800);
      expect(mockPipeline.expire).toHaveBeenCalledWith('auction:1:owner', 5400);
      expect(mockPipeline.expire).toHaveBeenCalledWith('auction:1:highest_bidder', 5400);
      expect(mockPipeline.exec).toHaveBeenCalled();
      expect(service['logger'].log).toHaveBeenCalledWith(expect.stringContaining('Auction 1 extended'));
    });

    it('should log error and not throw when pipeline fails', async () => {
      const mockPipeline = {
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(new Error('Pipeline error')),
      };
      (mockRedis.pipeline as jest.Mock).mockReturnValue(mockPipeline);

      await expect(service.extendAuctionTime(1, 1800)).resolves.not.toThrow();

      expect(service['logger'].error).toHaveBeenCalledWith(expect.stringContaining('Extend auction time error'), expect.any(String));
    });
  });

  describe('restoreAuction', () => {
    it('should set price, active, owner via pipeline without bidder key when highestBidderId is null', async () => {
      const mockPipeline = {
        set: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      };
      (mockRedis.pipeline as jest.Mock).mockReturnValue(mockPipeline);
      jest.spyOn(service['logger'], 'log').mockImplementation();

      await service.restoreAuction(1, 200, 3600, 5, null);

      expect(mockPipeline.set).toHaveBeenCalledWith('auction:1:price', 200, 'EX', 7200);
      expect(mockPipeline.set).toHaveBeenCalledWith('auction:1:active', '1', 'EX', 3600);
      expect(mockPipeline.set).toHaveBeenCalledWith('auction:1:owner', 5, 'EX', 7200);

      expect(mockPipeline.set).not.toHaveBeenCalledWith('auction:1:highest_bidder', expect.anything(), expect.anything(), expect.anything());
    });

    it('should also set the bidder key when highestBidderId is provided', async () => {
      const mockPipeline = {
        set: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      };
      (mockRedis.pipeline as jest.Mock).mockReturnValue(mockPipeline);
      jest.spyOn(service['logger'], 'log').mockImplementation();

      await service.restoreAuction(2, 300, 1800, 3, 42);

      expect(mockPipeline.set).toHaveBeenCalledWith('auction:2:highest_bidder', 42, 'EX', 5400);
    });

    it('should log error and not throw when pipeline fails', async () => {
      const mockPipeline = {
        set: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(new Error('Pipeline error')),
      };
      (mockRedis.pipeline as jest.Mock).mockReturnValue(mockPipeline);

      await expect(service.restoreAuction(1, 100, 3600, 1, null)).resolves.not.toThrow();

      expect(service['logger'].error).toHaveBeenCalledWith(expect.stringContaining('Restore auction error'), expect.any(String));
    });
  });

  describe('getAuctionOwner', () => {
    it('should return numeric owner ID when key exists', async () => {
      mockRedis.get.mockResolvedValue('7');

      const result = await service.getAuctionOwner(1);

      expect(result).toBe(7);
      expect(mockRedis.get).toHaveBeenCalledWith('auction:1:owner');
    });

    it('should return null when owner key does not exist', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await service.getAuctionOwner(1);

      expect(result).toBeNull();
    });

    it('should return null and log error when Redis fails', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis error'));

      const result = await service.getAuctionOwner(1);

      expect(result).toBeNull();
      expect(service['logger'].error).toHaveBeenCalledWith(expect.stringContaining('Get auction owner error'), expect.any(String));
    });
  });

  describe('cleanupAuction', () => {
    it('should delete all 5 auction keys atomically', async () => {
      (mockRedis.del as jest.Mock).mockResolvedValue(5);
      jest.spyOn(service['logger'], 'log').mockImplementation();

      await service.cleanupAuction(1);

      expect(mockRedis.del).toHaveBeenCalledWith('auction:1:price', 'auction:1:highest_bidder', 'auction:1:active', 'auction:1:owner', 'auction:1:participants');
      expect(service['logger'].log).toHaveBeenCalledWith(expect.stringContaining('Auction 1 data cleaned up'));
    });

    it('should log error and not throw when Redis fails', async () => {
      (mockRedis.del as jest.Mock).mockRejectedValue(new Error('Redis error'));

      await expect(service.cleanupAuction(1)).resolves.not.toThrow();

      expect(service['logger'].error).toHaveBeenCalledWith(expect.stringContaining('Cleanup auction error'), expect.any(String));
    });
  });

  describe('getHighestBidderId', () => {
    it('should return parsed integer bidder ID when key exists', async () => {
      mockRedis.get.mockResolvedValue('42');

      const result = await service.getHighestBidderId(1);

      expect(result).toBe(42);
      expect(mockRedis.get).toHaveBeenCalledWith('auction:1:highest_bidder');
    });

    it('should return null when bidder key does not exist', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await service.getHighestBidderId(1);

      expect(result).toBeNull();
    });

    it('should return null and log error when Redis fails', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis error'));

      const result = await service.getHighestBidderId(1);

      expect(result).toBeNull();
      expect(service['logger'].error).toHaveBeenCalledWith(expect.stringContaining('Get highest bidder error'), expect.any(String));
    });
  });

  describe('addUserToAuctionRoom', () => {
    it('should call hset with correct auction participants key', async () => {
      (mockRedis.hset as jest.Mock).mockResolvedValue(1);

      await service.addUserToAuctionRoom(1, 'socket-abc', 99);

      expect(mockRedis.hset).toHaveBeenCalledWith('auction:1:participants', 'socket-abc', '99');
    });

    it('should throw and log error when Redis fails', async () => {
      (mockRedis.hset as jest.Mock).mockRejectedValue(new Error('Redis error'));

      await expect(service.addUserToAuctionRoom(1, 'socket-abc', 99)).rejects.toThrow('Redis error');

      expect(service['logger'].error).toHaveBeenCalledWith(expect.stringContaining('Add socket'), expect.any(String));
    });
  });

  describe('removeUserFromAuctionRoom', () => {
    it('should call hdel with correct key and socketId', async () => {
      (mockRedis.hdel as jest.Mock).mockResolvedValue(1);

      await service.removeUserFromAuctionRoom(1, 'socket-abc');

      expect(mockRedis.hdel).toHaveBeenCalledWith('auction:1:participants', 'socket-abc');
    });

    it('should throw and log error when Redis fails', async () => {
      (mockRedis.hdel as jest.Mock).mockRejectedValue(new Error('Redis error'));

      await expect(service.removeUserFromAuctionRoom(1, 'socket-abc')).rejects.toThrow('Redis error');

      expect(service['logger'].error).toHaveBeenCalledWith(expect.stringContaining('Remove socket'), expect.any(String));
    });
  });

  describe('getAuctionParticipantsCount', () => {
    it('should return the number of participants via hlen', async () => {
      (mockRedis.hlen as jest.Mock).mockResolvedValue(3);

      const result = await service.getAuctionParticipantsCount(1);

      expect(result).toBe(3);
      expect(mockRedis.hlen).toHaveBeenCalledWith('auction:1:participants');
    });

    it('should return 0 and log error when Redis fails', async () => {
      (mockRedis.hlen as jest.Mock).mockRejectedValue(new Error('Redis error'));

      const result = await service.getAuctionParticipantsCount(1);

      expect(result).toBe(0);
      expect(service['logger'].error).toHaveBeenCalledWith(expect.stringContaining('Get participants count error'), expect.any(String));
    });
  });

  describe('setSocketAuction', () => {
    it('should map socket to auction with correct TTL', async () => {
      mockRedis.set.mockResolvedValue('OK');

      await service.setSocketAuction(1, 'socket-abc', 5);

      expect(mockRedis.set).toHaveBeenCalledWith('user:1:socket:socket-abc', 5, 'EX', SOCKET_AUCTION_TTL);
    });

    it('should throw and log error when Redis fails', async () => {
      mockRedis.set.mockRejectedValue(new Error('Redis error'));

      await expect(service.setSocketAuction(1, 'socket-abc', 5)).rejects.toThrow('Redis error');

      expect(service['logger'].error).toHaveBeenCalledWith(expect.stringContaining('Set socket auction error'), expect.any(String));
    });
  });

  describe('getSocketAuction', () => {
    it('should return auctionId as number when key exists', async () => {
      mockRedis.get.mockResolvedValue('5');

      const result = await service.getSocketAuction(1, 'socket-abc');

      expect(result).toBe(5);
      expect(mockRedis.get).toHaveBeenCalledWith('user:1:socket:socket-abc');
    });

    it('should return null when key does not exist', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await service.getSocketAuction(1, 'socket-abc');

      expect(result).toBeNull();
    });

    it('should return null and log error when Redis fails', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis error'));

      const result = await service.getSocketAuction(1, 'socket-abc');

      expect(result).toBeNull();
      expect(service['logger'].error).toHaveBeenCalledWith(expect.stringContaining('Get socket auction error'), expect.any(String));
    });
  });

  describe('deleteSocketAuction', () => {
    it('should delete the socket → auction mapping key', async () => {
      (mockRedis.del as jest.Mock).mockResolvedValue(1);

      await service.deleteSocketAuction(1, 'socket-abc');

      expect(mockRedis.del).toHaveBeenCalledWith('user:1:socket:socket-abc');
    });

    it('should throw and log error when Redis fails', async () => {
      (mockRedis.del as jest.Mock).mockRejectedValue(new Error('Redis error'));

      await expect(service.deleteSocketAuction(1, 'socket-abc')).rejects.toThrow('Redis error');

      expect(service['logger'].error).toHaveBeenCalledWith(expect.stringContaining('Delete socket auction error'), expect.any(String));
    });
  });

  describe('ping', () => {
    it('should return round-trip time in milliseconds when Redis replies PONG', async () => {
      mockRedis.ping = jest.fn().mockResolvedValue('PONG');

      const result = await service.ping();

      expect(result).toBeGreaterThanOrEqual(0);
      expect(mockRedis.ping).toHaveBeenCalled();
    });

    it('should throw when Redis replies with something other than PONG', async () => {
      mockRedis.ping = jest.fn().mockResolvedValue('PONG_UNEXPECTED');

      await expect(service.ping()).rejects.toThrow('Unexpected Redis PING response');
    });
  });

  describe('areAuctionsActive', () => {
    it('should return empty Set when called with empty array', async () => {
      const result = await service.areAuctionsActive([]);

      expect(result).toEqual(new Set());
      expect(mockRedis.pipeline).not.toHaveBeenCalled();
    });

    it('should return a Set of active auction IDs based on pipeline results', async () => {
      const mockPipeline = {
        exists: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 1],
          [null, 0],
          [null, 1],
        ]),
      };
      (mockRedis.pipeline as jest.Mock).mockReturnValue(mockPipeline);

      const result = await service.areAuctionsActive([1, 2, 3]);

      expect(result).toEqual(new Set([1, 3]));
      expect(mockPipeline.exists).toHaveBeenCalledTimes(3);
    });

    it('should return empty Set and log error when pipeline fails', async () => {
      const mockPipeline = {
        exists: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(new Error('Pipeline error')),
      };
      (mockRedis.pipeline as jest.Mock).mockReturnValue(mockPipeline);

      const result = await service.areAuctionsActive([1, 2]);

      expect(result).toEqual(new Set());
      expect(service['logger'].error).toHaveBeenCalledWith(expect.stringContaining('Batch check auction active error'), expect.any(String));
    });
  });

  describe('getUniqueParticipantsCount', () => {
    it('should return count of unique user IDs from hash values', async () => {
      mockRedis.hvals = jest.fn().mockResolvedValue(['1', '2', '1', '3']);

      const result = await service.getUniqueParticipantsCount(1);

      expect(result).toBe(3);
      expect(mockRedis.hvals).toHaveBeenCalledWith('auction:1:participants');
    });

    it('should return 0 when no participants are in the room', async () => {
      mockRedis.hvals = jest.fn().mockResolvedValue([]);

      const result = await service.getUniqueParticipantsCount(1);

      expect(result).toBe(0);
    });

    it('should return 0 and log error when Redis fails', async () => {
      mockRedis.hvals = jest.fn().mockRejectedValue(new Error('Redis error'));

      const result = await service.getUniqueParticipantsCount(1);

      expect(result).toBe(0);
      expect(service['logger'].error).toHaveBeenCalledWith(expect.stringContaining('Get unique participants count error'), expect.any(String));
    });
  });

  describe('placeBidAtomicWithSnapshot', () => {
    it('should return success=true with parsed previousPrice and previousBidderId when Lua script returns accepted=1', async () => {
      (mockRedis.placeBidAtomicCommand as jest.Mock).mockResolvedValue([1, '200', '7']);

      const result = await service.placeBidAtomicWithSnapshot(1, 99, 500, 10);

      expect(result).toEqual({ success: true, data: { previousPrice: 200, previousBidderId: 7 } });
      expect(mockRedis.placeBidAtomicCommand).toHaveBeenCalledWith('auction:1:price', 'auction:1:highest_bidder', 'auction:1:active', 500, 99, 10);
    });

    it('should return success=true with null previousPrice and null previousBidderId when it is the first bid', async () => {
      (mockRedis.placeBidAtomicCommand as jest.Mock).mockResolvedValue([1, null, null]);

      const result = await service.placeBidAtomicWithSnapshot(1, 99, 500, 10);

      expect(result).toEqual({ success: true, data: { previousPrice: null, previousBidderId: null } });
    });

    it('should return success=false when the Lua script returns accepted=0', async () => {
      (mockRedis.placeBidAtomicCommand as jest.Mock).mockResolvedValue([0, null, null]);

      const result = await service.placeBidAtomicWithSnapshot(1, 99, 500, 10);

      expect(result).toEqual({ success: false });
    });

    it('should return success=false and log error when Redis fails', async () => {
      (mockRedis.placeBidAtomicCommand as jest.Mock).mockRejectedValue(new Error('Lua error'));

      const result = await service.placeBidAtomicWithSnapshot(1, 99, 500, 10);

      expect(result).toEqual({ success: false });
      expect(service['logger'].error).toHaveBeenCalledWith(expect.stringContaining('Atomic bid error'), expect.any(String));
    });
  });

  describe('rollbackBid', () => {
    it('should restore previous price and bidder via pipeline when both exist', async () => {
      (mockRedis.ttl as jest.Mock).mockResolvedValue(3600);
      const mockPipeline = {
        set: jest.fn().mockReturnThis(),
        del: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      };
      (mockRedis.pipeline as jest.Mock).mockReturnValue(mockPipeline);
      jest.spyOn(service['logger'], 'warn').mockImplementation();

      await service.rollbackBid(1, 200, 7);

      expect(mockPipeline.set).toHaveBeenCalledWith('auction:1:price', 200, 'EX', 3600);
      expect(mockPipeline.set).toHaveBeenCalledWith('auction:1:highest_bidder', 7, 'EX', 3600);
      expect(mockPipeline.exec).toHaveBeenCalled();
      expect(service['logger'].warn).toHaveBeenCalledWith(expect.stringContaining('Bid rolled back'));
    });

    it('should delete price and bidder keys when both previousPrice and previousBidderId are null', async () => {
      (mockRedis.ttl as jest.Mock).mockResolvedValue(3600);
      const mockPipeline = {
        set: jest.fn().mockReturnThis(),
        del: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      };
      (mockRedis.pipeline as jest.Mock).mockReturnValue(mockPipeline);
      jest.spyOn(service['logger'], 'warn').mockImplementation();

      await service.rollbackBid(1, null, null);

      expect(mockPipeline.del).toHaveBeenCalledWith('auction:1:price');
      expect(mockPipeline.del).toHaveBeenCalledWith('auction:1:highest_bidder');
      expect(mockPipeline.set).not.toHaveBeenCalled();
    });

    it('should use safeTtl of 3600 when ttl returns -1 (key has no expiry)', async () => {
      (mockRedis.ttl as jest.Mock).mockResolvedValue(-1);
      const mockPipeline = {
        set: jest.fn().mockReturnThis(),
        del: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      };
      (mockRedis.pipeline as jest.Mock).mockReturnValue(mockPipeline);
      jest.spyOn(service['logger'], 'warn').mockImplementation();

      await service.rollbackBid(1, 100, null);

      expect(mockPipeline.set).toHaveBeenCalledWith('auction:1:price', 100, 'EX', 3600);
    });

    it('should warn and skip rollback when price key no longer exists (ttl === -2)', async () => {
      (mockRedis.ttl as jest.Mock).mockResolvedValue(-2);
      jest.spyOn(service['logger'], 'warn').mockImplementation();

      await service.rollbackBid(1, 100, 5);

      expect(mockRedis.pipeline).not.toHaveBeenCalled();
      expect(service['logger'].warn).toHaveBeenCalledWith(expect.stringContaining('Rollback skipped'));
    });

    it('should log critical error and not throw when pipeline fails', async () => {
      (mockRedis.ttl as jest.Mock).mockResolvedValue(3600);
      const mockPipeline = {
        set: jest.fn().mockReturnThis(),
        del: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(new Error('Pipeline error')),
      };
      (mockRedis.pipeline as jest.Mock).mockReturnValue(mockPipeline);

      await expect(service.rollbackBid(1, 100, 5)).resolves.not.toThrow();

      expect(service['logger'].error).toHaveBeenCalledWith(expect.stringContaining('CRITICAL'), expect.any(String));
    });
  });
});
