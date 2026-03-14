import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { REDIS_CLIENT } from './redis.constants';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  onModuleDestroy(): void {
    this.redis.disconnect();
  }

  async getCache<T = any>(key: string): Promise<T | null> {
    try {
      const data = await this.redis.get(key);
      return data ? (JSON.parse(data) as T) : null;
    } catch (error: unknown) {
      const stack = error instanceof Error ? error.stack : String(error);
      this.logger.error(`Cache get error for key "${key}"`, stack);
      return null;
    }
  }

  async setCache(key: string, value: any, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error: unknown) {
      const stack = error instanceof Error ? error.stack : String(error);
      this.logger.error(`Cache set error for key "${key}"`, stack);
    }
  }

  async deleteCache(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error: unknown) {
      const stack = error instanceof Error ? error.stack : String(error);
      this.logger.error(`Cache delete error for key "${key}"`, stack);
    }
  }

  async getLivePrice(auctionId: number): Promise<number | null> {
    try {
      const price = await this.redis.get(`auction:${auctionId}:price`);
      return price ? parseFloat(price) : null;
    } catch (error: unknown) {
      const stack = error instanceof Error ? error.stack : String(error);
      this.logger.error(`Get live price error for ID "${auctionId}"`, stack);
      return null;
    }
  }

  async invalidateCache(pattern: string): Promise<void> {
    try {
      let cursor = '0';
      let totalDeleted = 0;

      do {
        const [nextCursor, foundKeys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;

        if (foundKeys.length > 0) await this.redis.del(...foundKeys);
        totalDeleted += foundKeys.length;
      } while (cursor !== '0');

      if (totalDeleted > 0) this.logger.log(`Invalidated ${totalDeleted} keys matching "${pattern}"`);
    } catch (error: unknown) {
      const stack = error instanceof Error ? error.stack : String(error);
      this.logger.error(`Cache invalidation error for pattern "${pattern}"`, stack);
    }
  }
}
