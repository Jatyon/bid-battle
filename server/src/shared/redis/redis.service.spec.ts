import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from './redis.service';
import { REDIS_CLIENT } from './redis.constants';
import Redis from 'ioredis';

describe('RedisService', () => {
  let service: RedisService;
  let mockRedis: jest.Mocked<Redis>;

  beforeEach(async () => {
    mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      disconnect: jest.fn(),
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
});
