import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Paginator, PaginatorResponse } from '@core/models';
import { BidRepository, BidResponse } from '@modules/bid';
import { FileUploadService } from '@shared/file-upload';
import { RedisService } from '@shared/redis';
import { AuctionDetailResponse, AuctionResponse, CreateAuctionDto, UpdateAuctionDto } from './dto';
import { AuctionsRepository } from './repositories/auctions.repository';
import { AuctionScheduler } from './auction.scheduler';
import { Auction, AuctionImage } from './entities';
import { AuctionStatus } from './enums';
import { I18nContext } from 'nestjs-i18n';
import { In, Repository } from 'typeorm';

@Injectable()
export class AuctionsService {
  private readonly logger = new Logger(AuctionsService.name);

  constructor(
    @InjectRepository(AuctionImage)
    private auctionImageRepository: Repository<AuctionImage>,
    private bidRepository: BidRepository,
    private readonly auctionsRepository: AuctionsRepository,
    private readonly redisService: RedisService,
    private readonly fileUploadService: FileUploadService,
    private readonly auctionScheduler: AuctionScheduler,
  ) {}

  /**
   * Creates a new auction, persists it to the database, and schedules its activation.
   * * @remarks
   * All newly created auctions initially receive a `PENDING` status, regardless of their start time.
   * The actual activation (changing status to `ACTIVE` and initializing Redis) is delegated
   * to a BullMQ background job (`AuctionStartProcessor`) to ensure transactional consistency.
   * If the scheduling process fails, a compensation mechanism automatically rolls back
   * the auction's status to `CANCELED` to prevent "zombie" auctions that exist in the DB
   * but have no corresponding background jobs.
   *
   * @param createAuctionDto - The payload containing auction details (title, price, dates, images).
   * @param ownerId - The ID of the user creating the auction.
   * @returns A promise resolving to the fully constructed `AuctionResponse` object.
   * @throws {BadRequestException} If the provided `primaryImageIndex` is out of bounds.
   * @throws {Error} Rethrows any error encountered during BullMQ job scheduling after rolling back the DB state.
   */
  async createAuction(createAuctionDto: CreateAuctionDto, ownerId: number): Promise<AuctionResponse> {
    const primaryImageIndex: number = createAuctionDto.primaryImageIndex ?? 0;

    if (primaryImageIndex >= createAuctionDto.imageUrls.length) {
      throw new BadRequestException('error.validation.auction.primaryImageIndex_must_be_valid');
    }

    const primaryImageUrl: string = createAuctionDto.imageUrls[primaryImageIndex];

    const mappedImages = createAuctionDto.imageUrls.map((url, index) => ({
      imageUrl: url,
      isPrimary: index === primaryImageIndex,
    }));

    const now = new Date();
    const startTime = createAuctionDto.startTime ? new Date(createAuctionDto.startTime) : now;

    const auction: Auction = this.auctionsRepository.create({
      title: createAuctionDto.title,
      description: createAuctionDto.description,
      startingPrice: createAuctionDto.startingPrice,
      startTime,
      endTime: createAuctionDto.endTime,
      ownerId,
      currentPrice: createAuctionDto.startingPrice,
      status: AuctionStatus.PENDING,
      mainImageUrl: primaryImageUrl,
      images: mappedImages,
    });

    const savedAuction: Auction = await this.auctionsRepository.save(auction);

    try {
      await this.auctionScheduler.scheduleAuctionStart(savedAuction.id, startTime);
    } catch (error) {
      this.logger.error(`Auction ${savedAuction.id} scheduling failed — rolling back to CANCELED`, error instanceof Error ? error.stack : String(error));
      await this.auctionsRepository.update(savedAuction.id, { status: AuctionStatus.CANCELED });
      throw error;
    }

    return new AuctionResponse(savedAuction);
  }

  /**
   * Get active auctions with pagination
   * Implements caching strategy: first page is cached in Redis for 30 seconds
   * @param paginator - Pagination data
   * @returns Paginated list of auctions
   */
  async findActiveAuctions(paginator: Paginator): Promise<PaginatorResponse<AuctionResponse>> {
    const page: number = paginator.page || 1;
    const limit: number = paginator.limit || 10;
    const skip: number = paginator.skip;

    const cacheKey = `auctions:active:${page}:${limit}`;

    const cachedData = await this.redisService.getCache<PaginatorResponse<AuctionResponse>>(cacheKey);
    if (cachedData) return cachedData;

    const [auctions, total] = await this.auctionsRepository.findActiveAuctions(skip, limit);

    const items = auctions.map((auction) => new AuctionResponse(auction, true));

    const response = paginator.response(items, page, limit, total);

    await this.redisService.setCache(cacheKey, response, 30);

    return response;
  }

  /**
   * Get auction details by ID
   * Uses hybrid approach: current_price from Redis (if available), rest from MySQL
   * Canceled auctions are hidden from public — only accessible to the owner.
   * @param auctionId - Auction ID
   * @param requestingUserId - ID of the requesting user (optional, unauthenticated guests pass undefined)
   * @returns Auction details
   */
  async findOne(auctionId: number, requestingUserId?: number): Promise<AuctionDetailResponse> {
    const auction = await this.auctionsRepository.findByIdWithRelations(auctionId);

    if (!auction) throw new NotFoundException('error.auction.not_found');

    if (auction.status === AuctionStatus.CANCELED && auction.ownerId !== requestingUserId) throw new NotFoundException('error.auction.not_found');

    const cachedPrice = await this.redisService.getLivePrice(auctionId);

    if (cachedPrice) auction.currentPrice = cachedPrice;

    return new AuctionDetailResponse(auction);
  }

  /**
   * Get auctions created by a specific user (My Auctions)
   */
  async findMyAuctions(userId: number, paginator: Paginator): Promise<PaginatorResponse<AuctionResponse>> {
    const page: number = paginator.page || 1;
    const limit: number = paginator.limit || 10;
    const skip: number = paginator.skip;

    const [auctions, total] = await this.auctionsRepository.findPaginatedAuctionsByOwner(userId, skip, limit);

    const items = auctions.map((auction) => new AuctionResponse(auction));

    return paginator.response(items, page, limit, total);
  }

  async findAuctionBids(auctionId: number, paginator: Paginator, requestingUserId?: number): Promise<PaginatorResponse<BidResponse>> {
    const page: number = paginator.page || 1;
    const limit: number = paginator.limit;
    const skip: number = paginator.skip;

    const auction = await this.auctionsRepository.findOneBy({ id: auctionId });

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
   * @param auctionId - The unique identifier of the auction to cancel.
   * @param userId - The ID of the user attempting to cancel the auction (must be the owner).
   * @returns Updated auction
   */
  async cancelAuction(auctionId: number, userId: number): Promise<AuctionResponse> {
    const auction = await this.auctionsRepository.findByIdWithRelations(auctionId);

    if (!auction) throw new NotFoundException('error.auction.not_found');

    if (auction.ownerId !== userId) throw new ForbiddenException('error.auction.cancel_forbidden_not_owner');

    if (auction.status !== AuctionStatus.ACTIVE && auction.status !== AuctionStatus.PENDING) throw new BadRequestException('error.auction.cancel_forbidden_not_active');

    if (auction.status === AuctionStatus.ACTIVE) {
      const bidCount = await this.bidRepository.count({ where: { auctionId } });

      if (bidCount > 0) throw new BadRequestException('error.auction.cancel_forbidden_already_has_bids');
    }

    const previousStatus = auction.status;
    auction.status = AuctionStatus.CANCELED;

    const updatedAuction = await this.auctionsRepository.save(auction);

    if (previousStatus === AuctionStatus.PENDING) {
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

    let endTimeChanged = false;

    if (updateAuctionDto.endTime) {
      const newEndTime = new Date(updateAuctionDto.endTime);
      const now = new Date();

      if (newEndTime <= now) throw new BadRequestException('auction.error.update_forbidden_end_time_past');

      if (newEndTime <= auction.endTime) throw new BadRequestException('auction.error.update_forbidden_end_time');

      if (auction.status === AuctionStatus.ACTIVE) {
        const bidCount = await this.bidRepository.count({ where: { auctionId } });

        if (bidCount > 0) throw new BadRequestException('auction.error.update_forbidden_end_time_has_bids');
      }

      auction.endTime = newEndTime;
      endTimeChanged = true;
    }

    if (updateAuctionDto.title) auction.title = updateAuctionDto.title;
    if (updateAuctionDto.description) auction.description = updateAuctionDto.description;

    const updatedAuction = await this.auctionsRepository.save(auction);

    if (endTimeChanged && updatedAuction.status === AuctionStatus.ACTIVE) {
      await this.auctionScheduler.cancelAuctionEnd(auctionId);
      await this.auctionScheduler.scheduleAuctionEnd(auctionId, updatedAuction.endTime);

      const now = new Date();
      const newDurationSeconds = Math.floor((updatedAuction.endTime.getTime() - now.getTime()) / 1000);

      if (newDurationSeconds > 0) await this.redisService.extendAuctionTime(auctionId, newDurationSeconds);
    }

    await this.invalidateAuctionsCache();

    return new AuctionResponse(updatedAuction);
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
   * @param i18n - I18n context for error messages
   */
  async updateAuctionImages(
    auctionId: number,
    userId: number,
    files: Express.Multer.File[],
    existingImageUrls: string[],
    primaryImageIndex: number | undefined,
    i18n: I18nContext,
  ): Promise<void> {
    const auction = await this.auctionsRepository.findOneBy({ id: auctionId });

    if (!auction) throw new NotFoundException('error.auction.not_found');
    if (auction.ownerId !== userId) throw new ForbiddenException('error.auction.update_forbidden_not_owner');
    if (auction.status !== AuctionStatus.ACTIVE && auction.status !== AuctionStatus.PENDING) throw new BadRequestException('error.auction.update_forbidden_not_active');

    if (auction.status === AuctionStatus.ACTIVE) {
      const bidCount = await this.bidRepository.count({ where: { auctionId } });
      if (bidCount > 0) throw new BadRequestException('error.auction.update_forbidden_images_has_bids');
    }

    const hasNewFiles = files.length > 0;
    const hasExistingUrls = existingImageUrls.length > 0;

    if (!hasNewFiles && !hasExistingUrls) throw new BadRequestException('error.auction.no_images_provided');

    const allExisting = await this.auctionImageRepository.find({ where: { auctionId } });
    const existingAuctionUrls = allExisting.map((img) => img.imageUrl);

    const invalidUrls = existingImageUrls.filter((url) => !existingAuctionUrls.includes(url));
    if (invalidUrls.length > 0) throw new BadRequestException('error.auction.invalid_existing_image_urls');

    const toKeep = allExisting.filter((img) => existingImageUrls.includes(img.imageUrl));
    const toDelete = allExisting.filter((img) => !existingImageUrls.includes(img.imageUrl));
    const oldPathsToDelete = toDelete.map((img) => img.imageUrl.replace('/uploads/', ''));

    const MAX_IMAGES = 10;
    const totalCount = toKeep.length + files.length;

    if (totalCount > MAX_IMAGES) throw new BadRequestException(i18n.t('error.auction.too_many_images_#max', { args: { max: MAX_IMAGES } }));

    const uploadedFiles = hasNewFiles ? await this.fileUploadService.uploadMultiple(files, this.fileUploadService.getAuctionImageUploadOptions(), i18n) : [];

    const allUrls = [...toKeep.map((img) => img.imageUrl), ...uploadedFiles.map((f) => f.url)];
    const primaryIndex = primaryImageIndex ?? 0;

    if (primaryIndex >= allUrls.length) throw new BadRequestException('error.validation.auction.primaryImageIndex_must_be_valid');

    try {
      await this.auctionsRepository.manager.transaction(async (em) => {
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

        auction.mainImageUrl = allUrls[primaryIndex];
        await em.save(Auction, auction);
      });
    } catch (dbError) {
      this.logger.error(`updateAuctionImages failed for auction ${auctionId}`, dbError);

      if (uploadedFiles.length > 0) {
        const newPaths = uploadedFiles.map((f) => f.url.replace('/uploads/', ''));
        await this.fileUploadService.deleteFiles(newPaths).catch((deleteErr) => {
          this.logger.error(`Failed to rollback uploaded files for auction ${auctionId}`, deleteErr);
        });
      }
      throw new BadRequestException('error.auction.update_images_failed');
    }

    if (oldPathsToDelete.length > 0) {
      await this.fileUploadService.deleteFiles(oldPathsToDelete).catch((err) => {
        this.logger.error(`Failed to delete old auction images from disk for auction ${auctionId}`, err);
      });
    }

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
}
