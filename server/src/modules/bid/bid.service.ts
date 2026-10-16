import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '@config/config.service';
import { PaginatorResponse } from '@core/models';
import { Language } from '@core/enums';
import { UsersService, UserPreferencesService } from '@modules/users';
import { RedisService, BidRejectionCode } from '@shared/redis';
import { MailService } from '@shared/mail';
import { IAuctionState, IBidResult, IMyBidFilters } from './interfaces';
import { BidRepository } from './repositories/bid.repository';
import { GetMyBidsQueryDto, MyBidResponse } from './dto';
import { calcMinIncrement } from './bid.constants';
import { Bid } from './entities';
import { I18nService } from 'nestjs-i18n';

@Injectable()
export class BidService {
  private readonly logger = new Logger(BidService.name);

  constructor(
    private readonly bidRepository: BidRepository,
    private readonly redisService: RedisService,
    private readonly i18n: I18nService,
    private readonly configService: AppConfigService,
    private readonly usersService: UsersService,
    private readonly userPreferencesService: UserPreferencesService,
    private readonly mailService: MailService,
  ) {}

  /**
   * Get bids placed by a specific user (My Bids)
   */
  async findMyBids(userId: number, query: GetMyBidsQueryDto): Promise<PaginatorResponse<MyBidResponse>> {
    const page: number = query.page;
    const limit: number = query.limit;
    const skip: number = query.skip;

    const filters: IMyBidFilters = {
      search: query.search,
      category: query.category,
      auctionStatus: query.auctionStatus,
      bidStatus: query.bidStatus,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    };

    const [bids, total] = await this.bidRepository.findPaginatedBidByUser(userId, skip, limit, filters);

    const items = bids.map((bid) => new MyBidResponse(bid));
    return query.response(items, page, limit, total);
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
  async placeBid(auctionId: number, userId: number, amount: number, lang: Language): Promise<IBidResult> {
    try {
      if (amount <= 0 || !Number.isFinite(amount)) return this.fail('INVALID_AMOUNT', 'bid.error.invalid_amount', lang);

      const [ownerIdFromRedis, isActive, currentPrice, highestBidderId] = await Promise.all([
        this.redisService.getAuctionOwner(auctionId),
        this.redisService.isAuctionActive(auctionId),
        this.redisService.getLivePrice(auctionId),
        this.redisService.getHighestBidderId(auctionId),
      ]);

      if (ownerIdFromRedis === null) {
        this.logger.warn(`Owner key missing in Redis for auction ${auctionId} — blocking bid as fail-safe`);
        return this.fail('AUCTION_ENDED', 'bid.error.auction_ended', lang);
      }

      if (ownerIdFromRedis === userId) return this.fail('OWNER_CANNOT_BID', 'bid.error.owner_cannot_bid', lang);

      if (!isActive) return this.fail('AUCTION_ENDED', 'bid.error.auction_ended', lang);

      const minIncrement = calcMinIncrement(currentPrice ?? 0);
      const isFirstBid = highestBidderId === null;
      const minRequired = isFirstBid ? (currentPrice ?? 0) : (currentPrice ?? 0) + minIncrement;

      if (currentPrice !== null && amount < minRequired)
        return {
          success: false,
          reason: await this.i18n.translate('bid.error.bid_too_low_#minBid', { lang, args: { minBid: minRequired } }),
          code: 'BID_TOO_LOW',
          currentPrice,
          minNextBid: minRequired,
        };

      const atomicResult = await this.redisService.placeBidAtomicWithSnapshot(auctionId, userId, amount, minIncrement);

      if (atomicResult.success) {
        let savedBid: Bid;
        try {
          savedBid = await this.bidRepository.saveBidAndUpdateAuctionPrice(auctionId, userId, amount);
        } catch (dbError) {
          this.logger.error(`DB save failed after atomic bid — rolling back Redis for auction ${auctionId}`, dbError instanceof Error ? dbError.stack : String(dbError));

          await this.redisService.rollbackBid(auctionId, amount, userId, atomicResult.data.previousPrice, atomicResult.data.previousBidderId);
          return this.fail('SERVER_ERROR', 'bid.error.bid_failed', lang);
        }

        this.logger.log(`Bid placed: auction=${auctionId}, user=${userId}, amount=${amount}`);
        return { success: true, bid: savedBid, previousBidderId: atomicResult.data.previousBidderId };
      }

      const { rejectionCode } = atomicResult;

      if (rejectionCode === BidRejectionCode.ALREADY_LEADING) {
        const newCurrentPrice = atomicResult.currentPrice ?? (await this.redisService.getLivePrice(auctionId));
        const nextMin = newCurrentPrice ? newCurrentPrice + calcMinIncrement(newCurrentPrice) : undefined;
        return {
          success: false,
          reason: await this.i18n.translate('bid.error.already_leading', { lang }),
          code: 'ALREADY_LEADING',
          currentPrice: newCurrentPrice ?? undefined,
          minNextBid: nextMin,
        };
      }

      if (rejectionCode === BidRejectionCode.AUCTION_INACTIVE) return this.fail('AUCTION_ENDED', 'bid.error.auction_ended', lang);

      const newCurrentPrice = atomicResult.currentPrice ?? (await this.redisService.getLivePrice(auctionId));
      const nextMin = newCurrentPrice ? newCurrentPrice + calcMinIncrement(newCurrentPrice) : undefined;
      return {
        success: false,
        reason: await this.i18n.translate('bid.error.outbid', { lang }),
        code: 'OUTBID',
        currentPrice: newCurrentPrice ?? undefined,
        minNextBid: nextMin,
      };
    } catch (error) {
      this.logger.error(`Error placing bid: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error.stack : undefined);
      return this.fail('SERVER_ERROR', 'bid.error.bid_failed', lang);
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
        this.redisService.getUniqueParticipantsCount(auctionId),
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
   * Handles asynchronous email notification to the outbid user.
   * Respects user notification preferences and enforces an anti-spam cooldown window in Redis.
   *
   * @param auctionId - The ID of the auction
   * @param previousBidderId - The ID of the user who was outbid
   * @param newAmount - The new highest bid amount
   * @param auctionTitle - Optional title of the auction
   */
  async handleOutbidEmailNotification(auctionId: number, previousBidderId: number, newAmount: number, auctionTitle?: string): Promise<void> {
    const prefs = await this.userPreferencesService.findOrCreateByUserId(previousBidderId);
    if (!prefs.notifyOnOutbid) return;

    // Check rate limit / cooldown in Redis (10 minutes)
    const acquired = await this.redisService.acquireOutbidEmailCooldown(auctionId, previousBidderId, 600);
    if (!acquired) {
      this.logger.log(`Outbid email cooldown active for user ${previousBidderId} on auction ${auctionId} — skipping email`);
      return;
    }

    const previousUser = await this.usersService.findOneBy({ id: previousBidderId });
    if (!previousUser || !previousUser.email) return;

    const title = auctionTitle ?? `Auction #${auctionId}`;
    await this.mailService.sendAuctionOutbidEmail(previousUser.email, prefs.lang, previousUser.concatName, title, newAmount, auctionId);
    this.logger.log(`Outbid email queued for user ${previousBidderId} on auction ${auctionId}`);
  }

  /**
   * Helper method to generate standardized, translated error responses.
   * Keeps the main business logic DRY (Don't Repeat Yourself).
   *
   * @param code - The application-specific error code (e.g., 'INVALID_AMOUNT').
   * @param i18nKey - The translation key for the error message.
   * @returns A consistent IBidResult object indicating failure.
   */
  private async fail(code: string, i18nKey: string, lang: Language): Promise<IBidResult> {
    return {
      success: false,
      reason: await this.i18n.translate(i18nKey, { lang }),
      code,
    };
  }
}
