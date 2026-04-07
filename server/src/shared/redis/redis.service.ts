import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { BidAtomicSnapshot, ResultPlateBidAtomic } from './interfaces';
import { REDIS_CLIENT, SOCKET_AUCTION_TTL } from './redis.constants';
import Redis, { Result } from 'ioredis';

declare module 'ioredis' {
  interface RedisCommander<Context> {
    /**
     * Returns a 3-element array: [success (1|0), previousPrice|rejectionCode (string|null), previousBidderId (string|null)]
     * On success: previousPrice and previousBidderId are the Redis bulk-string values before the bid was applied,
     * or null (nil in Lua) when the key did not exist.
     * On failure: the second element is the rejection code as a string ("2"=inactive, "3"=already_leading, "4"=too_low).
     */
    placeBidAtomicCommand(
      priceKey: string,
      bidderKey: string,
      activeKey: string,
      newAmount: number,
      userId: number,
      minIncrement: number,
    ): Result<[number, string | null, string | null], Context>;
  }
}

/**
 * Centralized Redis key definitions for the auction domain.
 * Ensures consistency across the application when accessing Redis data.
 */
const RedisKey = {
  auctionActive: (id: number) => `auction:${id}:active`,
  auctionBidder: (id: number) => `auction:${id}:highest_bidder`,
  auctionOwner: (id: number) => `auction:${id}:owner`,
  auctionParticipants: (id: number) => `auction:${id}:participants`,
  auctionPrice: (id: number) => `auction:${id}:price`,
  userSocketAuction: (userId: number, socketId: string) => `user:${userId}:socket:${socketId}`,
} as const;

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  /**
   * LUA script for atomic bid placement.
   * Execution steps:
   * 1. Checks if the auction is active.
   * 2. Prevents the current highest bidder from outbidding themselves.
   * 3. Validates the minimum bid increment.
   * 4. Captures the previous price and bidder BEFORE writing (snapshot for rollback).
   * 5. Updates price and bidder atomically using KEEPTTL so existing TTLs are preserved.
   *
   * Returns a 3-element array:
   *   [1, previousPrice|false, previousBidderId|false]  – bid accepted
   *   [0, 2, false]                                     – bid rejected: auction inactive
   *   [0, 3, false]                                     – bid rejected: user is already leading
   *   [0, 4, false]                                     – bid rejected: amount too low
   *
   * Using the returned snapshot for rollback guarantees the restored values are
   * consistent with the exact moment of the atomic write, eliminating the TOCTOU
   * window that existed when previousBidderId was fetched in a separate round-trip.
   */
  private readonly BID_SCRIPT = `
    local priceKey = KEYS[1]
    local bidderKey = KEYS[2]
    local activeKey = KEYS[3]
    local newAmount = tonumber(ARGV[1])
    local userIdStr = ARGV[2]
    local minIncrement = tonumber(ARGV[3])

    -- Check if auction is active
    if redis.call('EXISTS', activeKey) == 0 then
      return {0, 2, false}
    end

    local currentPriceStr = redis.call('GET', priceKey)
    local currentBidderStr = redis.call('GET', bidderKey)
    local currentPrice = 0

    if currentPriceStr then
      currentPrice = tonumber(currentPriceStr)
    end

    -- Prevent user from outbidding themselves
    if currentBidderStr == userIdStr then
      return {0, 3, false}
    end

    -- Validate minimum increment
    if newAmount < currentPrice + minIncrement then
      return {0, 4, false}
    end

    -- Update price and bidder, preserving existing TTLs
    redis.call('SET', priceKey, tostring(newAmount), 'KEEPTTL')
    redis.call('SET', bidderKey, userIdStr, 'KEEPTTL')

    return {1, currentPriceStr or false, currentBidderStr or false}
  `;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  onModuleInit() {
    this.redis.defineCommand('placeBidAtomicCommand', {
      numberOfKeys: 3,
      lua: this.BID_SCRIPT,
    });
    this.logger.log('Redis Lua scripts loaded.');
  }

  onModuleDestroy(): void {
    this.redis.disconnect();
  }

  // --- Health ---

  /**
   * Verifies connectivity by issuing a PING command to Redis.
   * @returns Round-trip time in milliseconds.
   * @throws Error if Redis does not respond with PONG within the call.
   */
  async ping(): Promise<number> {
    const start = Date.now();
    const reply = await this.redis.ping();

    if (reply !== 'PONG') throw new Error(`Unexpected Redis PING response`);

    return Date.now() - start;
  }

  // --- Generic Cache Methods ---

  /**
   * Retrieves and parses a JSON payload from Redis.
   *
   * @param key - The Redis key to retrieve.
   * @returns The parsed object of type T, or null if the key doesn't exist or an error occurs.
   */
  async getCache<T = any>(key: string): Promise<T | null> {
    try {
      const data = await this.redis.get(key);
      return data ? (JSON.parse(data) as T) : null;
    } catch (error: unknown) {
      this.handleError(`Cache get error for key "${key}"`, error);
      return null;
    }
  }

  /**
   * Serializes an object and stores it in Redis with an expiration time.
   *
   * @param key - The Redis key to set.
   * @param value - The value to store (will be JSON stringified).
   * @param ttlSeconds - Time-To-Live in seconds.
   */
  async setCache(key: string, value: any, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error: unknown) {
      this.handleError(`Cache set error for key "${key}"`, error);
    }
  }

  /**
   * Deletes a specific key from Redis.
   *
   * @param key - The Redis key to delete.
   */
  async deleteCache(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error: unknown) {
      this.handleError(`Cache delete error for key "${key}"`, error);
    }
  }

  /**
   * Invalidates all cache keys matching a specific pattern using the SCAN command.
   *
   * @param pattern - The pattern to match (e.g., "auction:*:active").
   */
  async invalidateCache(pattern: string): Promise<void> {
    try {
      let cursor = '0';
      let totalDeleted = 0;

      do {
        const [nextCursor, foundKeys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;

        if (foundKeys.length > 0) {
          await this.redis.del(...foundKeys);
          totalDeleted += foundKeys.length;
        }
      } while (cursor !== '0');

      if (totalDeleted > 0) {
        this.logger.log(`Invalidated ${totalDeleted} keys matching "${pattern}"`);
      }
    } catch (error: unknown) {
      this.handleError(`Cache invalidation error for pattern "${pattern}"`, error);
    }
  }

  // --- Auction Domain Methods ---

  /**
   * Retrieves the current highest price for a specific auction.
   *
   * @param auctionId - The ID of the auction.
   * @returns The current live price, or null if no bids have been placed yet.
   */
  async getLivePrice(auctionId: number): Promise<number | null> {
    try {
      const price = await this.redis.get(RedisKey.auctionPrice(auctionId));
      return price ? parseFloat(price) : null;
    } catch (error: unknown) {
      this.handleError(`Get live price error for ID "${auctionId}"`, error);
      return null;
    }
  }

  /**
   * Checks whether an auction is currently active.
   * Used as a safeguard to prevent bids on ended or non-existent auctions.
   *
   * @param auctionId - The ID of the auction.
   * @returns True if the active key exists, false otherwise.
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
   * Batch-checks whether multiple auctions are currently active in Redis.
   * Uses a pipeline to send all EXISTS commands in a single round-trip.
   *
   * @param auctionIds - Array of auction IDs to check.
   * @returns A Set of IDs that are currently active in Redis.
   */
  async areAuctionsActive(auctionIds: number[]): Promise<Set<number>> {
    if (auctionIds.length === 0) return new Set();

    try {
      const pipeline = this.redis.pipeline();

      for (const id of auctionIds) {
        pipeline.exists(RedisKey.auctionActive(id));
      }

      const results = await pipeline.exec();

      return new Set(
        auctionIds.filter((id, index) => {
          const result = results?.[index];
          return result?.[0] === null && result?.[1] === 1;
        }),
      );
    } catch (error: unknown) {
      this.handleError('Batch check auction active error', error);
      return new Set();
    }
  }

  /**
   * Initializes a new auction in Redis with its starting parameters.
   * Sets the initial price, the active status flag, and the owner ID.
   *
   * @remarks
   * **Atomicity** — all three SET commands are sent in a single pipeline, so they
   * are flushed to Redis in one round-trip. A pipeline is not a transaction (MULTI/EXEC),
   * but it eliminates the partial-write window that existed with three separate awaits /
   * Promise.all calls. A full MULTI/EXEC is deliberately avoided here because the Lua
   * bid script uses KEYS that overlap with these, and mixing MULTI with Lua in the same
   * connection can cause subtle ordering issues.
   *
   * **Idempotency** — each SET uses the NX (Not eXists) flag so that a BullMQ retry
   * of the start-job never overwrites an already-active auction (e.g. one that received
   * bids between the first attempt and the retry).  If the active key is already present
   * the method logs a warning and returns early without touching any keys.
   *
   * **TTL fail-safe** — all keys (except the 'active' flag) receive a TTL equal to the
   * auction duration plus a 1-hour buffer to prevent Redis memory leaks when
   * `cleanupAuction` is never called due to a process crash.
   *
   * @param auctionId - The unique identifier of the auction.
   * @param startingPrice - The base price at which the auction starts.
   * @param durationSeconds - The exact duration of the auction in seconds.
   * @param ownerId - The ID of the user who created the auction.
   * @returns A promise that resolves when all keys are successfully set.
   */
  async initializeAuction(auctionId: number, startingPrice: number, durationSeconds: number, ownerId: number): Promise<void> {
    try {
      const ttlWithBuffer = durationSeconds + 3600;

      const transaction = this.redis.multi();

      transaction.set(RedisKey.auctionActive(auctionId), '1', 'EX', durationSeconds, 'NX');
      transaction.set(RedisKey.auctionPrice(auctionId), String(startingPrice), 'EX', ttlWithBuffer, 'NX');
      transaction.set(RedisKey.auctionOwner(auctionId), String(ownerId), 'EX', ttlWithBuffer, 'NX');

      const results = await transaction.exec();

      const activeResult = results?.[0]?.[1];

      if (activeResult === null) {
        this.logger.warn(`Auction ${auctionId} already initialized in Redis — skipping (idempotent retry)`);
        return;
      }

      const pipelineErrors = results?.filter(([err]) => err !== null);

      if (pipelineErrors && pipelineErrors.length > 0)
        throw new Error(`Pipeline error(s) during initializeAuction: ${pipelineErrors.map(([e]) => (e as Error).message).join('; ')}`);

      this.logger.log(`Auction ${auctionId} initialized: price=${startingPrice}, duration=${durationSeconds}s, owner=${ownerId}`);
    } catch (error: unknown) {
      this.handleError(`Initialize auction error for ID "${auctionId}"`, error);
    }
  }

  async extendAuctionTime(auctionId: number, additionalDurationSeconds: number): Promise<void> {
    try {
      const ttlWithBuffer = additionalDurationSeconds + 3600;

      const pipeline = this.redis.pipeline();

      pipeline.expire(RedisKey.auctionPrice(auctionId), ttlWithBuffer);
      pipeline.expire(RedisKey.auctionActive(auctionId), additionalDurationSeconds);
      pipeline.expire(RedisKey.auctionOwner(auctionId), ttlWithBuffer);
      pipeline.expire(RedisKey.auctionBidder(auctionId), ttlWithBuffer);

      await pipeline.exec();
      this.logger.log(`Auction ${auctionId} extended in Redis. New active TTL: ${additionalDurationSeconds}s`);
    } catch (error: unknown) {
      this.handleError(`Extend auction time error for ID "${auctionId}"`, error);
    }
  }

  /**
   * Restores the state of an active auction in Redis, typically invoked during
   * server reconciliation after a crash or restart.
   * * @remarks
   * Unlike `initializeAuction`, this method specifically restores the `highestBidderId`.
   * This is a critical step to prevent the auction from resolving with a `null` winner
   * if it ends shortly after the server restarts. It uses a Redis pipeline to batch
   * the commands for better performance.
   *
   * @param auctionId - The unique identifier of the auction.
   * @param currentPrice - The last known highest price retrieved from the database.
   * @param durationSeconds - The remaining duration of the auction in seconds.
   * @param ownerId - The ID of the user who created the auction.
   * @param highestBidderId - The ID of the current leading bidder, or null if no bids exist.
   * @returns A promise that resolves when the pipeline executes successfully.
   */
  async restoreAuction(auctionId: number, currentPrice: number, durationSeconds: number, ownerId: number, highestBidderId: number | null): Promise<void> {
    try {
      const ttlWithBuffer = durationSeconds + 3600;

      const pipeline = this.redis.pipeline();
      pipeline.set(RedisKey.auctionPrice(auctionId), currentPrice, 'EX', ttlWithBuffer);
      pipeline.set(RedisKey.auctionActive(auctionId), '1', 'EX', durationSeconds);
      pipeline.set(RedisKey.auctionOwner(auctionId), ownerId, 'EX', ttlWithBuffer);

      if (highestBidderId !== null) {
        pipeline.set(RedisKey.auctionBidder(auctionId), highestBidderId, 'EX', ttlWithBuffer);
      }

      await pipeline.exec();
      this.logger.log(`Auction ${auctionId} restored: price=${currentPrice}, duration=${durationSeconds}s, owner=${ownerId}, highestBidder=${highestBidderId ?? 'none'}`);
    } catch (error: unknown) {
      this.handleError(`Restore auction error for ID "${auctionId}"`, error);
    }
  }

  /**
   * Retrieves the ID of the auction's owner.
   * Used to prevent owners from bidding on their own items.
   *
   * @param auctionId - The ID of the auction.
   * @returns The owner's user ID, or null if the auction is not found.
   */
  async getAuctionOwner(auctionId: number): Promise<number | null> {
    try {
      const ownerId = await this.redis.get(RedisKey.auctionOwner(auctionId));
      return ownerId !== null ? Number(ownerId) : null;
    } catch (error: unknown) {
      this.handleError(`Get auction owner error for ID "${auctionId}"`, error);
      return null;
    }
  }

  /**
   * Performs a hard cleanup of all Redis keys associated with a specific auction.
   * * @remarks
   * This method should be called immediately after an auction officially ends
   * and its final state is safely persisted to the database. It prevents RAM
   * clutter by proactively deleting the price, bidder, status, owner, and
   * participants Hash map.
   *
   * @param auctionId - The unique identifier of the auction to be cleaned up.
   * @returns A promise that resolves when the deletion is confirmed.
   */
  async cleanupAuction(auctionId: number): Promise<void> {
    try {
      await this.redis.del(
        RedisKey.auctionPrice(auctionId),
        RedisKey.auctionBidder(auctionId),
        RedisKey.auctionActive(auctionId),
        RedisKey.auctionOwner(auctionId),
        RedisKey.auctionParticipants(auctionId),
      );
      this.logger.log(`Auction ${auctionId} data cleaned up from Redis`);
    } catch (error: unknown) {
      this.handleError(`Cleanup auction error for ID "${auctionId}"`, error);
    }
  }

  /**
   * Retrieves the ID of the current highest bidder.
   *
   * @param auctionId - The ID of the auction.
   * @returns The user ID of the highest bidder, or null if there are no bids.
   */
  async getHighestBidderId(auctionId: number): Promise<number | null> {
    try {
      const bidderId = await this.redis.get(RedisKey.auctionBidder(auctionId));
      return bidderId !== null ? parseInt(bidderId, 10) : null;
    } catch (error: unknown) {
      this.handleError(`Get highest bidder error for auction "${auctionId}"`, error);
      return null;
    }
  }

  // --- Socket Management ---

  /**
   * Removes a specific socket connection from the auction room participants (Hash map).
   * Prevents total user removal if the user has other active tabs/devices.
   *
   * @param auctionId - The ID of the auction.
   * @param socketId - The unique ID of the socket.
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
   * Gets the number of unique socket connections currently in the auction room.
   * @param auctionId - The ID of the auction.
   */
  async getAuctionParticipantsCount(auctionId: number): Promise<number> {
    try {
      return await this.redis.hlen(RedisKey.auctionParticipants(auctionId));
    } catch (error: unknown) {
      this.handleError(`Get participants count error for auction "${auctionId}"`, error);
      return 0;
    }
  }

  /**
   * Returns the number of **unique users** currently in the auction room.
   * Unlike `getAuctionParticipantsCount` (which counts socket entries),
   * this deduplicates users who have multiple open tabs / devices.
   *
   * @param auctionId - The ID of the auction.
   * @returns The count of distinct user IDs present in the room.
   */
  async getUniqueParticipantsCount(auctionId: number): Promise<number> {
    try {
      const values = await this.redis.hvals(RedisKey.auctionParticipants(auctionId));
      return new Set(values).size;
    } catch (error: unknown) {
      this.handleError(`Get unique participants count error for auction "${auctionId}"`, error);
      return 0;
    }
  }

  /**
   * Retrieves the auction ID currently assigned to a specific socket.
   * Acts as the source of truth for multi-server/load-balanced environments.
   *
   * @param userId - The ID of the user.
   * @param socketId - The unique ID of the socket.
   * @returns The auction ID the socket is bound to, or null if not found.
   */
  async getSocketAuction(userId: number, socketId: string): Promise<number | null> {
    try {
      const val = await this.redis.get(RedisKey.userSocketAuction(userId, socketId));
      return val ? Number(val) : null;
    } catch (error: unknown) {
      this.handleError(`Get socket auction error for user "${userId}", socket "${socketId}"`, error);
      return null;
    }
  }

  /**
   * Deletes the temporary mapping between a user's socket and an auction.
   *
   * @param userId - The ID of the user.
   * @param socketId - The unique ID of the socket.
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
   * Registers a user's socket as a participant in the auction room using a Redis Hash.
   *
   * @param auctionId - The ID of the auction.
   * @param socketId - The unique ID of the socket.
   * @param userId - The ID of the user joining the room.
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
   * Maps a socket to an auction with a specific TTL.
   * Prevents Redis clutter in case a socket disconnects without triggering a cleanup event.
   *
   * @param userId - The ID of the user.
   * @param socketId - The unique ID of the socket.
   * @param auctionId - The ID of the auction to map to.
   */
  async setSocketAuction(userId: number, socketId: string, auctionId: number): Promise<void> {
    try {
      await this.redis.set(RedisKey.userSocketAuction(userId, socketId), auctionId, 'EX', SOCKET_AUCTION_TTL);
    } catch (error: unknown) {
      this.handleError(`Set socket auction error for user "${userId}", socket "${socketId}"`, error);
      throw error;
    }
  }

  // --- Atomic Operations ---

  /**
   * Executes the atomic bid placement Lua script in Redis.
   * Ensures thread safety and prevents race conditions when multiple users bid simultaneously.
   *
   * The script captures the state **before** the write inside the same Lua execution,
   * eliminating the TOCTOU window that would exist if the snapshot were fetched in a
   * separate round-trip. The returned snapshot allows the caller to perform a safe
   * rollback via {@link rollbackBid} without any additional Redis commands.
   *
   * @param auctionId - The ID of the auction.
   * @param userId - The ID of the user placing the bid.
   * @param newAmount - The proposed bid amount.
   * @param minIncrement - The minimum required difference between the current and new bid.
   * @returns {@link Result} discriminated by `success`:
   * - `{ success: true, data: BidAtomicSnapshot }` — bid accepted; `data` contains the pre-write snapshot.
   * - `{ success: false, rejectionCode: 2 }` — auction is no longer active.
   * - `{ success: false, rejectionCode: 3 }` — user is already the highest bidder.
   * - `{ success: false, rejectionCode: 4 }` — bid amount is below the required minimum increment.
   * - `{ success: false }` — unexpected Redis/Lua exception (no code available).
   */
  async placeBidAtomicWithSnapshot(auctionId: number, userId: number, newAmount: number, minIncrement: number): Promise<ResultPlateBidAtomic<BidAtomicSnapshot>> {
    try {
      const result = await this.redis.placeBidAtomicCommand(
        RedisKey.auctionPrice(auctionId),
        RedisKey.auctionBidder(auctionId),
        RedisKey.auctionActive(auctionId),
        newAmount,
        userId,
        minIncrement,
      );

      const [accepted, rawPrice, rawBidder] = result;

      if (accepted !== 1) {
        const rejectionCode = rawPrice != null ? parseInt(rawPrice, 10) : undefined;
        return { success: false, rejectionCode };
      }

      return {
        success: true,
        data: { previousPrice: rawPrice != null ? parseFloat(rawPrice) : null, previousBidderId: rawBidder != null ? parseInt(rawBidder, 10) : null },
      };
    } catch (error: unknown) {
      this.handleError(`Atomic bid error for auction "${auctionId}"`, error);
      return { success: false };
    }
  }

  /**
   * Atomically rolls back the Redis state if database persistence fails after a successful bid.
   * Restores the previous price and bidder ID while maintaining the original TTL.
   *
   * @param auctionId - The ID of the auction.
   * @param previousPrice - The price to restore, or null if this was the first bid.
   * @param previousBidderId - The bidder ID to restore, or null if there was no prior bidder.
   */
  async rollbackBid(auctionId: number, previousPrice: number | null, previousBidderId: number | null): Promise<void> {
    try {
      const remainingTtl = await this.redis.ttl(RedisKey.auctionPrice(auctionId));

      if (remainingTtl === -2) {
        this.logger.warn(`Rollback skipped for auction ${auctionId} — price key no longer exists`);
        return;
      }

      const safeTtl = remainingTtl > 0 ? remainingTtl : 3600;

      const pipeline = this.redis.pipeline();

      if (previousPrice !== null) pipeline.set(RedisKey.auctionPrice(auctionId), previousPrice, 'EX', safeTtl);
      else pipeline.del(RedisKey.auctionPrice(auctionId));

      if (previousBidderId !== null) {
        pipeline.set(RedisKey.auctionBidder(auctionId), previousBidderId, 'EX', safeTtl);
      } else {
        pipeline.del(RedisKey.auctionBidder(auctionId));
      }

      await pipeline.exec();
      this.logger.warn(`Bid rolled back in Redis for auction ${auctionId} — restored price=${previousPrice}, bidder=${previousBidderId ?? 'none'}`);
    } catch (error: unknown) {
      this.logger.error(`CRITICAL: Redis rollback failed for auction ${auctionId}. Inconsistency risk!`, error instanceof Error ? error.stack : String(error));
    }
  }

  /**
   * Standardizes error logging across the service.
   *
   * @param message - The context or description of the error.
   * @param error - The actual error object or string.
   */
  private handleError(message: string, error: unknown): void {
    const stack = error instanceof Error ? error.stack : String(error);
    this.logger.error(message, stack);
  }
}
