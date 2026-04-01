import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '@config/config.service';
import { Paginator, PaginatorResponse } from '@core/models';
import { RedisService, BidRejectionCode } from '@shared/redis';
import { BidRepository } from './repositories/bid.repository';
import { IAuctionState, IBidResult } from './interfaces';
import { calcMinIncrement } from './bid.constants';
import { MyBidResponse } from './dto';
import { I18nService } from 'nestjs-i18n';

@Injectable()
export class BidService {
  private readonly logger = new Logger(BidService.name);

  constructor(
    private readonly bidRepository: BidRepository,
    private readonly redisService: RedisService,
    private readonly i18n: I18nService,
    private readonly configService: AppConfigService,
  ) {}

  /**
   * Get bids placed by a specific user (My Bids)
   */
  async findMyBids(userId: number, paginator: Paginator): Promise<PaginatorResponse<MyBidResponse>> {
    const page: number = paginator.page || 1;
    const limit: number = paginator.limit;
    const skip: number = paginator.skip;

    const [bids, total] = await this.bidRepository.findPaginatedBidByUser(userId, skip, limit);

    const items = bids.map((bid) => new MyBidResponse(bid));
    return paginator.response(items, page, limit, total);
  }

  /**
   * Orchestrates the process of placing a new bid on an auction.
   * Ensures data consistency between the fast in-memory store (Redis) and the persistent database MySQL.
   * * The process follows these steps:
   * 1. Basic input validation (amount > 0).
   * 2. Parallel retrieval of auction state from Redis (owner, status, current price).
   * 3. Business rule validation (owner cannot bid, auction must be active, bid must be high enough).
   * 4. Atomic execution of the bid in Redis via a Lua script to prevent race conditions.
   *    The script returns a snapshot of the state BEFORE the write — this eliminates the
   *    TOCTOU window that existed when previousBidderId was fetched in a separate round-trip.
   * 5. Persistent storage of the bid in the relational database.
   * 6. Automatic rollback in Redis if the database save fails, using the atomic snapshot.
   *
   * @param auctionId - The unique identifier of the auction.
   * @param userId - The ID of the user attempting to place the bid.
   * @param amount - The monetary amount the user wants to bid.
   * @returns An object containing the success status, and error details/current prices if applicable.
   */
  async placeBid(auctionId: number, userId: number, amount: number): Promise<IBidResult> {
    try {
      if (amount <= 0 || !Number.isFinite(amount)) return this.fail('INVALID_AMOUNT', 'bid.error.invalid_amount');

      const [ownerIdFromRedis, isActive, currentPrice] = await Promise.all([
        this.redisService.getAuctionOwner(auctionId),
        this.redisService.isAuctionActive(auctionId),
        this.redisService.getLivePrice(auctionId),
      ]);

      if (ownerIdFromRedis === null) {
        this.logger.warn(`Owner key missing in Redis for auction ${auctionId} — blocking bid as fail-safe`);
        return this.fail('AUCTION_ENDED', 'bid.error.auction_ended');
      }

      if (ownerIdFromRedis === userId) return this.fail('OWNER_CANNOT_BID', 'bid.error.owner_cannot_bid');

      if (!isActive) return this.fail('AUCTION_ENDED', 'bid.error.auction_ended');

      const { minIncrementPercent, minIncrementAbsolute } = this.configService.bid;
      const minIncrement = calcMinIncrement(currentPrice ?? 0, minIncrementPercent, minIncrementAbsolute);

      if (currentPrice !== null && amount < currentPrice + minIncrement)
        return {
          success: false,
          reason: await this.i18n.translate('bid.error.bid_too_low_#minBid', { args: { minBid: currentPrice + minIncrement } }),
          code: 'BID_TOO_LOW',
          currentPrice,
          minNextBid: currentPrice + minIncrement,
        };

      const atomicResult = await this.redisService.placeBidAtomicWithSnapshot(auctionId, userId, amount, minIncrement);

      if (atomicResult.success) {
        try {
          await this.bidRepository.save(
            this.bidRepository.create({
              auctionId,
              userId,
              amount,
            }),
          );
        } catch (dbError) {
          this.logger.error(`DB save failed after atomic bid — rolling back Redis for auction ${auctionId}`, dbError instanceof Error ? dbError.stack : String(dbError));

          await this.redisService.rollbackBid(auctionId, atomicResult.data.previousPrice, atomicResult.data.previousBidderId);
          return this.fail('SERVER_ERROR', 'bid.error.bid_failed');
        }

        this.logger.log(`Bid placed: auction=${auctionId}, user=${userId}, amount=${amount}`);
        return { success: true };
      }

      const { rejectionCode } = atomicResult;

      if (rejectionCode === BidRejectionCode.ALREADY_LEADING) {
        const newCurrentPrice = await this.redisService.getLivePrice(auctionId);
        return {
          success: false,
          reason: await this.i18n.translate('bid.error.already_leading'),
          code: 'ALREADY_LEADING',
          currentPrice: newCurrentPrice ?? undefined,
        };
      }

      if (rejectionCode === BidRejectionCode.AUCTION_INACTIVE) return this.fail('AUCTION_ENDED', 'bid.error.auction_ended');

      const newCurrentPrice = await this.redisService.getLivePrice(auctionId);
      return {
        success: false,
        reason: await this.i18n.translate('bid.error.outbid'),
        code: 'OUTBID',
        currentPrice: newCurrentPrice ?? undefined,
      };
    } catch (error) {
      this.logger.error(`Error placing bid: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error.stack : undefined);
      return this.fail('SERVER_ERROR', 'bid.error.bid_failed');
    }
  }

  /**
   * Fetches the current live state of an auction from Redis.
   * Protects privacy by determining if the requester is the leader,
   * rather than returning the raw ID of the highest bidder.
   *
   * @param auctionId - The ID of the auction to query.
   * @param requestingUserId - (Optional) The ID of the user requesting the state.
   * @returns A promise resolving to the current auction state.
   */
  async getCurrentState(auctionId: number, requestingUserId?: number): Promise<IAuctionState> {
    try {
      const [currentPrice, highestBidderId, isActive, participantsCount] = await Promise.all([
        this.redisService.getLivePrice(auctionId),
        this.redisService.getHighestBidderId(auctionId),
        this.redisService.isAuctionActive(auctionId),
        this.redisService.getAuctionParticipantsCount(auctionId),
      ]);

      const isLeading = requestingUserId !== undefined && highestBidderId === requestingUserId;

      return {
        currentPrice: currentPrice ?? 0,
        isLeading,
        isActive: !!isActive,
        participantsCount: participantsCount ?? 0,
      };
    } catch (error) {
      this.logger.error(
        `Error getting current state for auction ${auctionId}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Helper method to generate standardized, translated error responses.
   * Keeps the main business logic DRY (Don't Repeat Yourself).
   *
   * @param code - The application-specific error code (e.g., 'INVALID_AMOUNT').
   * @param i18nKey - The translation key for the error message.
   * @returns A consistent IBidResult object indicating failure.
   */
  private async fail(code: string, i18nKey: string): Promise<IBidResult> {
    return {
      success: false,
      reason: await this.i18n.translate(i18nKey),
      code,
    };
  }
}
