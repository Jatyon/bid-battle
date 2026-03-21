import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { REDIS_CLIENT, SOCKET_AUCTION_TTL } from './redis.constants';
import Redis from 'ioredis';

const RedisKey = {
  auctionActive: (id: number) => `auction:${id}:active`,
  auctionParticipants: (id: number) => `auction:${id}:participants`,
  userSocketAuction: (userId: number, socketId: string) => `user:${userId}:socket:${socketId}`,
} as const;

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

  /**
   * Checks if an auction is currently active.
   * Used as a safeguard to prevent users from joining non-existent or ended auctions.
   * * @param auctionId - The ID of the auction to check
   * @returns True if the auction exists and is active, false otherwise
   */
  async isAuctionActive(auctionId: number): Promise<boolean> {
    try {
      const exists = await this.redis.exists(RedisKey.auctionActive(auctionId));
      return exists === 1;
    } catch (error: unknown) {
      this.handleError(`Check auction active error for ID "${auctionId}"`, error);
      return false;
    }
  }

  /**
   * Removes a specific socket connection from the auction room.
   * Ensures that closing one tab does not remove the user entirely if they have other active tabs.
   * * @param auctionId - The ID of the auction
   * @param socketId - The unique ID of the disconnected socket
   */
  async removeUserFromAuctionRoom(auctionId: number, socketId: string): Promise<void> {
    try {
      await this.redis.hdel(RedisKey.auctionParticipants(auctionId), socketId);
    } catch (error: unknown) {
      this.handleError(`Remove socket "${socketId}" from auction "${auctionId}" error`, error);
      throw error;
    }
  }

  /**
   * Deletes the temporary mapping between a socket and an auction.
   * Called when a user explicitly leaves an auction or disconnects.
   * * @param userId - The ID of the user
   * @param socketId - The unique ID of the socket
   */
  async deleteSocketAuction(userId: number, socketId: string): Promise<void> {
    try {
      await this.redis.del(RedisKey.userSocketAuction(userId, socketId));
    } catch (error: unknown) {
      this.handleError(`Delete socket auction error for user "${userId}", socket "${socketId}"`, error);
      throw error;
    }
  }

  /**
   * Adds a user's specific socket connection to the auction room.
   * Uses a Redis Hash to allow the same user to connect from multiple tabs/devices simultaneously.
   * * @param auctionId - The ID of the auction
   * @param socketId - The unique ID of the client's socket
   * @param userId - The ID of the user joining the auction
   */
  async addUserToAuctionRoom(auctionId: number, socketId: string, userId: number): Promise<void> {
    try {
      await this.redis.hset(RedisKey.auctionParticipants(auctionId), socketId, userId.toString());
    } catch (error: unknown) {
      this.handleError(`Add socket "${socketId}" (user: ${userId}) to auction "${auctionId}" error`, error);
      throw error;
    }
  }

  /**
   * Saves the socket -> auction mapping for a specific user.
   * A 24h TTL prevents Redis from getting cluttered in case of a server crash
   * (when the disconnect event never fires).
   *
   * @param userId - The ID of the authenticated user
   * @param socketId - The unique ID of the client's socket connection
   * @param auctionId - The ID of the joined auction
   */
  async setSocketAuction(userId: number, socketId: string, auctionId: number): Promise<void> {
    try {
      await this.redis.set(RedisKey.userSocketAuction(userId, socketId), auctionId, 'EX', SOCKET_AUCTION_TTL);
    } catch (error: unknown) {
      this.handleError(`Set socket auction error for user "${userId}", socket "${socketId}"`, error);
      throw error;
    }
  }

  private handleError(message: string, error: unknown): void {
    const stack = error instanceof Error ? error.stack : String(error);
    this.logger.error(message, stack);
  }
}
