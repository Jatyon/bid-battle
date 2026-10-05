import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Paginator, PaginatorResponse } from '@core/models';
import { SortOrder } from '@core/enums';
import { BidRepository } from '@modules/bid/repositories/bid.repository';
import { Bid } from '@modules/bid/entities';
import { BidResponse } from '@modules/bid';
import { AppConfigService } from '@config/config.service';
import { FileUploadService } from '@shared/file-upload';
import { RedisService } from '@shared/redis';
import { AuctionDetailResponse, AuctionResponse, CreateAuctionDto, GetAuctionsQueryDto, GetMyAuctionsQueryDto, MyAuctionResponse, UpdateAuctionDto } from './dto';
import { IAuctionUser, IMyAuctionFilters } from './interfaces';
import { User } from '@modules/users/entities';
import { AuctionsRepository } from './repositories/auctions.repository';
import { AuctionScheduler } from './auction.scheduler';
import { Auction, AuctionImage } from './entities';
import { AuctionCategory, AuctionSortBy, AuctionStatus } from './enums';
import { AUCTION_MAX_IMAGES } from './auction.constants';
import { DataSource, In, Repository } from 'typeorm';
import { I18nService, I18nContext } from 'nestjs-i18n';

@Injectable()
export class AuctionsService {
  private readonly logger = new Logger(AuctionsService.name);

  constructor(
    @InjectRepository(AuctionImage)
    private readonly auctionImageRepository: Repository<AuctionImage>,
    private readonly bidRepository: BidRepository,
    private readonly auctionsRepository: AuctionsRepository,
    private readonly redisService: RedisService,
    private readonly fileUploadService: FileUploadService,
    private readonly auctionScheduler: AuctionScheduler,
    private readonly dataSource: DataSource,
    private readonly i18n: I18nService,
    private readonly configService: AppConfigService,
  ) {}

  /**
   * Creates a new auction, persists it to the database, and schedules its activation.
   *
   * @remarks
   * All newly created auctions initially receive a `PENDING` status, regardless of their
   * start time. The actual activation (changing status to `ACTIVE` and initializing Redis)
   * is delegated to a BullMQ background job (`AuctionStartProcessor`).
   *
   * **Crash-safety — "hard rollback" pattern:**
   * The auction is saved inside a DB transaction. If the subsequent BullMQ enqueue fails,
   * the transaction is rolled back via `queryRunner.rollbackTransaction()`, completely
   * removing the row from the database. This eliminates the "zombie PENDING" failure mode
   * of the previous Saga pattern, where:
   *  1. `save()` succeeded,
   *  2. `scheduleAuctionStart()` failed, and
   *  3. the compensating `update(status=CANCELED)` itself could also fail on a second crash,
   *     leaving the row permanently stuck in PENDING with no job ever assigned to it.
   *
   * Crash scenarios and their outcomes with the new pattern:
   * - BullMQ unavailable → `scheduleAuctionStart` throws → transaction is rolled back →
   *   no row exists in DB, request fails cleanly, nothing to fix manually.
   * - Crash between `commitTransaction` and `scheduleAuctionStart` resolving →
   *   row committed to DB, job not enqueued. The startup reconciliation in
   *   `AuctionStartProcessor.onApplicationBootstrap` handles this: PENDING auctions
   *   with a `startTime` in the past are rescheduled immediately on next server boot.
   * - Normal flow → transaction committed, job enqueued, everything consistent.
   *
   * @param createAuctionDto - The payload containing auction details (title, price, dates, images).
   * @param ownerId - The ID of the user creating the auction.
   * @returns A promise resolving to the fully constructed `AuctionResponse` object.
   * @throws {BadRequestException} If the provided `primaryImageIndex` is out of bounds.
   * @throws {Error} Rethrows any error from the DB save or BullMQ enqueue after full rollback.
   */
  async createAuction(createAuctionDto: CreateAuctionDto, ownerId: number): Promise<AuctionResponse> {
    const primaryImageIndex: number = createAuctionDto.primaryImageIndex ?? 0;

    if (primaryImageIndex >= createAuctionDto.imageUrls.length) throw new BadRequestException('error.validation.auction.primaryImageIndex_must_be_valid');

    const primaryImageUrl: string = createAuctionDto.imageUrls[primaryImageIndex];

    const mappedImages = createAuctionDto.imageUrls.map((url, index) => ({
      imageUrl: url,
      isPrimary: index === primaryImageIndex,
    }));

    const now = new Date();
    const startTime = createAuctionDto.startTime ? new Date(createAuctionDto.startTime) : now;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let savedAuction: Auction;

    try {
      const auction = queryRunner.manager.create(Auction, {
        title: createAuctionDto.title,
        description: createAuctionDto.description,
        startingPrice: createAuctionDto.startingPrice,
        startTime,
        endTime: createAuctionDto.endTime,
        ownerId,
        currentPrice: createAuctionDto.startingPrice,
        status: AuctionStatus.PENDING,
        category: createAuctionDto.category ?? AuctionCategory.OTHER,
        mainImageUrl: primaryImageUrl,
        images: mappedImages,
      });

      savedAuction = await queryRunner.manager.save(Auction, auction);

      await this.auctionScheduler.scheduleAuctionStart(savedAuction.id, startTime);

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Auction creation failed — transaction rolled back`, error instanceof Error ? error.stack : String(error));
      throw error;
    } finally {
      await queryRunner.release();
    }

    return new AuctionResponse(savedAuction);
  }

  /**
   * Get active auctions with optional filtering, sorting and pagination.
   * Implements a cache-aside strategy: results are stored in Redis for 30 seconds.
   * Cache key is derived from all query parameters so each unique filter combination
   * is cached independently. The cache is invalidated proactively whenever the auction
   * list can change:
   * - auction transitions to ACTIVE (AuctionStartProcessor)
   * - auction transitions to ENDED (AuctionEndProcessor)
   * - auction is canceled (cancelAuction)
   * - auction details or images are updated (updateAuction, updateAuctionImages)
   * @param query - Pagination + filter + sort parameters
   * @returns Paginated list of auctions matching the criteria
   */
  async findActiveAuctions(query: GetAuctionsQueryDto): Promise<PaginatorResponse<AuctionResponse>> {
    const page = query.page;
    const limit = query.limit;
    const skip = query.skip;

    const filters = {
      search: query.search,
      category: query.category,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    };

    const cacheKey = this.buildAuctionsCacheKey(page, limit, filters);

    const cachedData = await this.redisService.getCache<PaginatorResponse<AuctionResponse>>(cacheKey);

    if (cachedData) return cachedData;

    const [auctions, total] = await this.auctionsRepository.findActiveAuctions(skip, limit, filters);

    const items = auctions.map((auction) => new AuctionResponse(auction, true));

    const response = query.response(items, page, limit, total);

    await this.redisService.setCache(cacheKey, response, 30);

    return response;
  }

  /**
   * Build a deterministic Redis cache key for the active-auctions list query.
   * Only non-default / truthy filter values are included so that the canonical
   * "no filters" key stays identical to the old `auctions:active:${page}:${limit}`.
   * Default values (sortBy=createdAt, sortOrder=DESC) are omitted intentionally.
   */
  private buildAuctionsCacheKey(page: number, limit: number, filters: Record<string, unknown>): string {
    const parts: string[] = [`auctions:active:${page}:${limit}`];

    const { search, category, minPrice, maxPrice, sortBy, sortOrder } = filters as {
      search?: string;
      category?: string;
      minPrice?: number;
      maxPrice?: number;
      sortBy?: string;
      sortOrder?: string;
    };

    if (search) parts.push(`s=${encodeURIComponent(search.trim())}`);
    if (category) parts.push(`cat=${category}`);
    if (minPrice) parts.push(`min=${minPrice}`);
    if (maxPrice) parts.push(`max=${maxPrice}`);
    if (sortBy && String(sortBy) !== String(AuctionSortBy.CREATED_AT)) parts.push(`by=${sortBy}`);
    if (sortOrder && String(sortOrder) !== String(SortOrder.DESC)) parts.push(`ord=${sortOrder}`);

    return parts.join(':');
  }

  /**
   * Get auction details by ID
   * Uses hybrid approach: current_price from Redis (if available), rest from MySQL.
   * The live price from Redis is used **only** when the auction is ACTIVE — for ENDED,
   * PENDING and CANCELED auctions the persisted DB value is always authoritative.
   * This prevents serving a stale `null` (or missing key) from Redis during the brief
   * window between `em.update` and `cleanupAuction` in the end-processor.
   * Canceled auctions are hidden from public — only accessible to the owner.
   * @param auctionId - Auction ID
   * @param requestingUserId - ID of the requesting user (optional, unauthenticated guests pass undefined)
   * @returns Auction details
   */
  async findOne(auctionId: number, requestingUserId?: number): Promise<AuctionDetailResponse> {
    const auction = await this.auctionsRepository.findByIdWithRelations(auctionId);

    if (!auction) throw new NotFoundException('error.auction.not_found');

    if (auction.status === AuctionStatus.CANCELED && auction.ownerId !== requestingUserId) throw new NotFoundException('error.auction.not_found');

    if (auction.status === AuctionStatus.ACTIVE) {
      const [livePrice, isActiveInRedis] = await Promise.all([this.redisService.getLivePrice(auctionId), this.redisService.isAuctionActive(auctionId)]);

      if (isActiveInRedis && livePrice !== null) auction.currentPrice = livePrice;
    }

    return new AuctionDetailResponse(auction);
  }

  /**
   * Get auctions created by a specific user (My Auctions)
   */
  async findMyAuctions(userId: number, query: GetMyAuctionsQueryDto): Promise<PaginatorResponse<MyAuctionResponse>> {
    const page: number = query.page;
    const limit: number = query.limit;
    const skip: number = query.skip;

    const filters: IMyAuctionFilters = {
      search: query.search,
      status: query.status,
      category: query.category,
      hasWinner: query.hasWinner,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    };

    const [auctions, total] = await this.auctionsRepository.findPaginatedAuctionsByOwner(userId, skip, limit, filters);

    const activeAuctions = auctions.filter((auction) => auction.status === AuctionStatus.ACTIVE);
    const highestBidderMap = new Map<number, IAuctionUser | null>();

    if (activeAuctions.length > 0) {
      const activeAuctionData = await Promise.all(
        activeAuctions.map(async (auction) => {
          const [livePrice, bidderId] = await Promise.all([this.redisService.getLivePrice(auction.id), this.redisService.getHighestBidderId(auction.id)]);

          if (livePrice !== null && livePrice !== undefined) auction.currentPrice = livePrice;

          return { auctionId: auction.id, bidderId: bidderId ?? null };
        }),
      );

      const missingBidderAuctionIds = activeAuctionData.filter((item) => item.bidderId === null).map((item) => item.auctionId);

      let dbBidsMap = new Map<number, number>();

      if (missingBidderAuctionIds.length > 0) {
        const dbBids = await this.bidRepository.findByOrphanedIds(missingBidderAuctionIds);
        dbBidsMap = new Map(dbBids.map((b) => [b.auctionId, b.userId]));
      }

      const auctionToBidderIdMap = new Map<number, number | null>();

      for (const item of activeAuctionData) {
        const bidderId = item.bidderId ?? dbBidsMap.get(item.auctionId) ?? null;
        auctionToBidderIdMap.set(item.auctionId, bidderId);
      }

      const uniqueUserIds = Array.from(new Set(Array.from(auctionToBidderIdMap.values()).filter((id): id is number => id !== null)));

      const userMap = new Map<number, IAuctionUser>();
      if (uniqueUserIds.length > 0) {
        const userRepo = this.dataSource.getRepository(User);
        const users = await userRepo.find({
          where: { id: In(uniqueUserIds) },
          withDeleted: true,
        });

        for (const user of users) {
          if (user.deletedAt) {
            userMap.set(user.id, { id: user.id, isDeleted: true });
          } else {
            userMap.set(user.id, {
              id: user.id,
              firstName: user.firstName,
              lastName: user.lastName,
              avatar: user.avatar,
            });
          }
        }
      }

      for (const [auctionId, bidderId] of auctionToBidderIdMap.entries()) {
        if (bidderId === null) highestBidderMap.set(auctionId, null);
        else highestBidderMap.set(auctionId, userMap.get(bidderId) ?? { id: bidderId, isDeleted: true });
      }
    }

    const items = auctions.map((auction) => {
      if (auction.status === AuctionStatus.ACTIVE) return new MyAuctionResponse(auction, highestBidderMap.get(auction.id) ?? null);

      return new MyAuctionResponse(auction);
    });

    return query.response(items, page, limit, total);
  }

  /**
   * Get bid history for a specific auction
   */
  async findAuctionBids(auctionId: number, paginator: Paginator, requestingUserId?: number): Promise<PaginatorResponse<BidResponse>> {
    const page: number = paginator.page;
    const limit: number = paginator.limit;
    const skip: number = paginator.skip;

    const auction = await this.auctionsRepository.findOne({
      where: { id: auctionId },
      select: ['id', 'status', 'ownerId'],
    });

    if (!auction) throw new NotFoundException('error.auction.not_found');

    if (auction.status === AuctionStatus.CANCELED && auction.ownerId !== requestingUserId) throw new NotFoundException('error.auction.not_found');

    const [bids, total] = await this.bidRepository.findPaginatedBidByAuction(auctionId, skip, limit);

    const items = bids.map((bid) => new BidResponse(bid, true));

    return paginator.response(items, page, limit, total);
  }

  /**
   * Cancels an auction, ensuring that no bids have been placed if it is already active.
   * * @remarks
   * An auction can only be canceled if its status is `PENDING` or `ACTIVE`.
   * If the auction is `ACTIVE`, a strict database check is performed against the bids table
   * to guarantee that 0 bids exist.
   * Depending on the auction's prior state, this method safely orchestrates the cleanup of
   * background scheduling jobs (BullMQ) and live in-memory data (Redis) to prevent
   * zombie processes and memory leaks.
   *
   * The bid-count check and the status update are executed inside a single transaction
   * with a pessimistic write lock on the auction row. This eliminates the TOCTOU race
   * condition where a bid could be placed between the `count()` query and the `save()` call.
   *
   * @param auctionId - The unique identifier of the auction to cancel.
   * @param userId - The ID of the user attempting to cancel the auction (must be the owner).
   * @returns Updated auction
   */
  async cancelAuction(auctionId: number, userId: number): Promise<AuctionResponse> {
    const auctionPreCheck = await this.auctionsRepository.findOneBy({ id: auctionId });

    if (!auctionPreCheck) throw new NotFoundException('error.auction.not_found');

    if (auctionPreCheck.ownerId !== userId) throw new ForbiddenException('error.auction.cancel_forbidden_not_owner');

    if (auctionPreCheck.status !== AuctionStatus.ACTIVE && auctionPreCheck.status !== AuctionStatus.PENDING)
      throw new BadRequestException('error.auction.cancel_forbidden_not_active');

    let previousStatus: AuctionStatus;

    const updatedAuction = await this.dataSource.transaction(async (em) => {
      const auction = await em.findOne(Auction, {
        where: { id: auctionId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!auction) throw new NotFoundException('error.auction.not_found');

      if (auction.status !== AuctionStatus.ACTIVE && auction.status !== AuctionStatus.PENDING) throw new BadRequestException('error.auction.cancel_forbidden_not_active');

      if (auction.status === AuctionStatus.ACTIVE) {
        const bidCount = await em.count(Bid, { where: { auctionId } });

        if (bidCount > 0) throw new BadRequestException('error.auction.cancel_forbidden_already_has_bids');
      }

      previousStatus = auction.status;
      auction.status = AuctionStatus.CANCELED;
      return await em.save(Auction, auction);
    });

    if (previousStatus! === AuctionStatus.PENDING) {
      await this.auctionScheduler.cancelAuctionStart(auctionId);
    } else {
      await this.auctionScheduler.cancelAuctionEnd(auctionId);
      await this.redisService.cleanupAuction(auctionId);
    }

    await this.invalidateAuctionsCache();
    await this.invalidatePriceCache(auctionId);

    return new AuctionResponse(updatedAuction);
  }

  /**
   * Updates auction details.
   * End time can only be extended and only if no bids are placed (for ACTIVE status).
   * Infrastructure (BullMQ/Redis) is updated only for already ACTIVE auctions.
   *
   * @remarks
   * **TOCTOU fix for endTime change on ACTIVE auctions:**
   * When `endTime` is being changed and the auction is ACTIVE, the bid-count check
   * and the save are executed inside a single transaction with a pessimistic write lock.
   * This eliminates the race condition where a bid could be placed between the `count()`
   * query and the `save()` call (identical pattern to `cancelAuction`).
   * For PENDING auctions (no live bids possible) the transaction/lock overhead is skipped.
   *
   * @param auctionId - Unique ID of the auction to update.
   * @param updateAuctionDto - Data transfer object containing title, description, or endTime.
   * @param userId - ID of the user requesting the update (must be the owner).
   * @returns A promise resolving to the updated AuctionResponse object.
   */
  async updateAuction(auctionId: number, updateAuctionDto: UpdateAuctionDto, userId: number): Promise<AuctionResponse> {
    const auction = await this.auctionsRepository.findOneBy({ id: auctionId });

    if (!auction) throw new NotFoundException('error.auction.not_found');
    if (auction.ownerId !== userId) throw new ForbiddenException('error.auction.update_forbidden_not_owner');
    if (auction.status !== AuctionStatus.ACTIVE && auction.status !== AuctionStatus.PENDING) throw new BadRequestException('error.auction.update_forbidden_not_active');

    const requestedEndTime = updateAuctionDto.endTime ? new Date(updateAuctionDto.endTime) : undefined;
    const requestedStartTime = updateAuctionDto.startTime ? new Date(updateAuctionDto.startTime) : undefined;

    if (requestedStartTime && auction.status === AuctionStatus.ACTIVE) throw new BadRequestException('auction.error.update_forbidden_start_time_active');

    if (requestedEndTime) {
      const now = new Date();
      if (requestedEndTime <= now) throw new BadRequestException('auction.error.update_forbidden_end_time_past');
      if (requestedEndTime <= auction.endTime) throw new BadRequestException('auction.error.update_forbidden_end_time');
    }

    let updatedAuction: Auction;
    let endTimeChanged = false;
    let startTimeChanged = false;

    if (auction.status === AuctionStatus.ACTIVE) {
      updatedAuction = await this.dataSource.transaction(async (em) => {
        const lockedAuction = await em.findOne(Auction, {
          where: { id: auctionId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!lockedAuction) throw new NotFoundException('error.auction.not_found');
        if (lockedAuction.status !== AuctionStatus.ACTIVE) throw new BadRequestException('error.auction.update_forbidden_not_active');

        const bidCount = await em.count(Bid, { where: { auctionId } });

        if (bidCount > 0) {
          if (updateAuctionDto.title) throw new BadRequestException('auction.error.update_forbidden_title_has_bids');
          if (updateAuctionDto.category !== undefined) throw new BadRequestException('auction.error.update_forbidden_category_has_bids');
          if (updateAuctionDto.startingPrice !== undefined) throw new BadRequestException('auction.error.update_forbidden_starting_price_has_bids');
          if (updateAuctionDto.description) throw new BadRequestException('auction.error.update_forbidden_description_has_bids');
          if (requestedEndTime) throw new BadRequestException('auction.error.update_forbidden_end_time_has_bids');

          if (updateAuctionDto.appendDescription) lockedAuction.description = this.buildUpdatedDescription(lockedAuction.description, updateAuctionDto.appendDescription);
        } else {
          const result = this.applyUpdatesToAuction(lockedAuction, updateAuctionDto, requestedStartTime, requestedEndTime);
          endTimeChanged = result.endTimeChanged;
          startTimeChanged = result.startTimeChanged;
        }

        return em.save(Auction, lockedAuction);
      });
    } else {
      const result = this.applyUpdatesToAuction(auction, updateAuctionDto, requestedStartTime, requestedEndTime);
      endTimeChanged = result.endTimeChanged;
      startTimeChanged = result.startTimeChanged;
      updatedAuction = await this.auctionsRepository.save(auction);

      if (startTimeChanged) {
        await this.auctionScheduler.cancelAuctionStart(auctionId);
        await this.auctionScheduler.scheduleAuctionStart(auctionId, updatedAuction.startTime);
      }
    }

    if (endTimeChanged && updatedAuction.status === AuctionStatus.ACTIVE) {
      await this.auctionScheduler.cancelAuctionEnd(auctionId);
      await this.auctionScheduler.scheduleAuctionEnd(auctionId, updatedAuction.endTime);

      const newDurationSeconds = Math.floor((updatedAuction.endTime.getTime() - Date.now()) / 1000);
      if (newDurationSeconds > 0) await this.redisService.extendAuctionTime(auctionId, newDurationSeconds);
    }

    await this.invalidateAuctionsCache();

    return new AuctionResponse(updatedAuction);
  }

  /**
   * Helper method to apply updates to an auction entity.
   */
  private applyUpdatesToAuction(
    target: Auction,
    updateAuctionDto: UpdateAuctionDto,
    requestedStartTime?: Date,
    requestedEndTime?: Date,
  ): { endTimeChanged: boolean; startTimeChanged: boolean } {
    let endTimeChanged = false;
    let startTimeChanged = false;

    if (requestedEndTime) {
      target.endTime = requestedEndTime;
      endTimeChanged = true;
    }
    if (requestedStartTime) {
      target.startTime = requestedStartTime;
      startTimeChanged = true;
    }
    if (updateAuctionDto.title) target.title = updateAuctionDto.title;
    if (updateAuctionDto.description) target.description = updateAuctionDto.description;
    if (updateAuctionDto.appendDescription) target.description = this.buildUpdatedDescription(target.description, updateAuctionDto.appendDescription);

    if (updateAuctionDto.category !== undefined) target.category = updateAuctionDto.category ?? null;
    if (updateAuctionDto.startingPrice !== undefined) {
      target.startingPrice = updateAuctionDto.startingPrice;
      target.currentPrice = updateAuctionDto.startingPrice;
    }

    return { endTimeChanged, startTimeChanged };
  }

  /**
   * Update auction images
   * Handles adding new images, removing old ones, and updating primary image.
   * Existing images not in existingImageUrls will be deleted.
   * New files will be uploaded and added to the auction.
   *
   * @param auctionId - Auction ID
   * @param userId - User ID (must be auction owner)
   * @param files - New files to upload (can be empty)
   * @param existingImageUrls - URLs of existing images to keep
   * @param primaryImageIndex - Index of primary image in the final set (kept + new)
   */
  async updateAuctionImages(auctionId: number, userId: number, files: Express.Multer.File[], existingImageUrls: string[], primaryImageIndex: number | undefined): Promise<void> {
    const auction = await this.auctionsRepository.findOneBy({ id: auctionId });

    if (!auction) throw new NotFoundException('error.auction.not_found');
    if (auction.ownerId !== userId) throw new ForbiddenException('error.auction.update_forbidden_not_owner');
    if (auction.status !== AuctionStatus.ACTIVE && auction.status !== AuctionStatus.PENDING) throw new BadRequestException('error.auction.update_forbidden_not_active');

    const hasNewFiles = files.length > 0;
    const hasExistingUrls = existingImageUrls.length > 0;

    if (!hasNewFiles && !hasExistingUrls) throw new BadRequestException('error.auction.no_images_provided');

    const allExisting = await this.auctionImageRepository.find({ where: { auctionId } });
    const existingAuctionUrls = allExisting.map((img) => img.imageUrl);

    const invalidUrls = existingImageUrls.filter((url) => !existingAuctionUrls.includes(url));
    if (invalidUrls.length > 0) throw new BadRequestException('error.auction.invalid_existing_image_urls');

    const toKeep = allExisting.filter((img) => existingImageUrls.includes(img.imageUrl));
    const toDelete = allExisting.filter((img) => !existingImageUrls.includes(img.imageUrl));

    const oldFileKeysToDelete = toDelete.map((img) => this.fileUploadService.extractKeyFromUrl(img.imageUrl)).filter((key): key is string => key !== null);

    const totalCount = toKeep.length + files.length;

    if (totalCount > AUCTION_MAX_IMAGES) throw new BadRequestException({ message: 'error.auction.too_many_images_#max', args: { max: AUCTION_MAX_IMAGES } });

    const uploadedFiles = hasNewFiles ? await this.fileUploadService.uploadMultiple(files, this.fileUploadService.getAuctionImageUploadOptions()) : [];

    const allUrls = [...toKeep.map((img) => img.imageUrl), ...uploadedFiles.map((f) => f.url)];
    const primaryIndex = primaryImageIndex ?? 0;

    if (primaryIndex >= allUrls.length) throw new BadRequestException('error.validation.auction.primaryImageIndex_must_be_valid');

    try {
      await this.auctionsRepository.manager.transaction(async (em) => {
        // Re-validate with pessimistic lock to prevent TOCTOU race condition:
        // a bid could be placed between the initial ownership/status check and this DB write.
        if (auction.status === AuctionStatus.ACTIVE) {
          const lockedAuction = await em.findOne(Auction, {
            where: { id: auctionId },
            lock: { mode: 'pessimistic_write' },
          });

          if (lockedAuction) {
            const bidCount = await em.count(Bid, { where: { auctionId } });
            if (bidCount > 0) throw new BadRequestException('error.auction.update_forbidden_images_has_bids');
          }
        }

        if (toDelete.length > 0) await em.delete(AuctionImage, { id: In(toDelete.map((img) => img.id)) });

        for (const img of toKeep) {
          const newIsPrimary = allUrls.indexOf(img.imageUrl) === primaryIndex;

          if (img.isPrimary !== newIsPrimary) {
            img.isPrimary = newIsPrimary;
            await em.save(AuctionImage, img);
          }
        }

        if (uploadedFiles.length > 0) {
          const newEntities = uploadedFiles.map((file) => {
            const image = new AuctionImage();
            image.imageUrl = file.url;
            image.isPrimary = allUrls.indexOf(file.url) === primaryIndex;
            image.auctionId = auctionId;
            return image;
          });
          await em.save(AuctionImage, newEntities);
        }

        await em.update(Auction, auctionId, { mainImageUrl: allUrls[primaryIndex] });
      });
    } catch (dbError) {
      this.logger.error(`updateAuctionImages failed for auction ${auctionId}`, dbError);

      if (uploadedFiles.length > 0) {
        const newFileKeys = uploadedFiles.map((f) => f.path);
        await this.fileUploadService.deleteFiles(newFileKeys);
      }
      throw new BadRequestException('error.auction.update_images_failed');
    }

    if (oldFileKeysToDelete.length > 0) await this.fileUploadService.deleteFiles(oldFileKeysToDelete);

    await this.invalidateAuctionsCache();
  }

  /**
   * Invalidate auctions list cache
   */
  private async invalidateAuctionsCache(): Promise<void> {
    await this.redisService.invalidateCache('auctions:active:*');
  }

  /**
   * Invalidate price cache for specific auction
   */
  private async invalidatePriceCache(auctionId: number): Promise<void> {
    await this.redisService.deleteCache(`auction:${auctionId}:price`);
  }

  /**
   * Appends a timestamped note to an existing auction description.
   * Centralizes the formatting to avoid duplication across ACTIVE/PENDING paths.
   *
   * @param currentDescription - The current description to append to.
   * @param appendText - The text to append.
   * @returns The updated description string.
   */
  private buildUpdatedDescription(currentDescription: string, appendText: string): string {
    const lang = I18nContext.current()?.lang ?? this.configService.i18n.fallbackLanguage;
    const dateStr = new Date().toLocaleDateString(lang);
    const updateHeader = this.i18n.translate('auction.info.update_description', { lang, args: { date: dateStr } });
    return `${currentDescription}\n\n${updateHeader}\n${appendText}`;
  }
}
