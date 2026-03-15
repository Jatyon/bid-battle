import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Paginator, PaginatorResponse } from '@core/models';
import { FileUploadService } from '@shared/file-upload';
import { RedisService } from '@shared/redis';
import { AuctionDetailResponse, AuctionResponse, CreateAuctionDto, UpdateAuctionDto } from './dto';
import { AuctionsRepository } from './repositories/auctions.repository';
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
    private readonly auctionsRepository: AuctionsRepository,
    private readonly redisService: RedisService,
    private readonly fileUploadService: FileUploadService,
  ) {}

  /**
   * Create a new auction
   * @param createAuctionDto - Auction creation data
   * @param ownerId - User ID of the auction owner
   * @returns Created auction
   */
  async createAuction(createAuctionDto: CreateAuctionDto, ownerId: number): Promise<AuctionResponse> {
    const primaryImageIndex: number = createAuctionDto.primaryImageIndex ?? 0;

    if (primaryImageIndex >= createAuctionDto.imageUrls.length) throw new BadRequestException('error.validation.auction.primaryImageIndex_must_be_valid');

    const primaryImageUrl: string = createAuctionDto.imageUrls[primaryImageIndex];

    const mappedImages = createAuctionDto.imageUrls.map((url, index) => ({
      imageUrl: url,
      isPrimary: index === primaryImageIndex,
    }));

    const auction: Auction = this.auctionsRepository.create({
      title: createAuctionDto.title,
      description: createAuctionDto.description,
      startingPrice: createAuctionDto.startingPrice,
      endTime: createAuctionDto.endTime,
      ownerId,
      currentPrice: createAuctionDto.startingPrice,
      status: AuctionStatus.ACTIVE,
      mainImageUrl: primaryImageUrl,
      images: mappedImages,
    });

    const savedAuction: Auction = await this.auctionsRepository.save(auction);

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

    if (page === 1) {
      const cachedData = await this.redisService.getCache<PaginatorResponse<AuctionResponse>>(cacheKey);

      if (cachedData) return cachedData;
    }

    const [auctions, total] = await this.auctionsRepository.findActiveAuctions(skip, limit);

    const items = auctions.map((auction) => new AuctionResponse(auction, true));

    const response = paginator.response(items, page, limit, total);

    if (page === 1) await this.redisService.setCache(cacheKey, response, 30);

    return response;
  }

  /**
   * Get auction details by ID
   * Uses hybrid approach: current_price from Redis (if available), rest from MySQL
   * @param auctionId - Auction ID
   * @returns Auction details
   */
  async findOne(auctionId: number): Promise<AuctionDetailResponse> {
    const auction = await this.auctionsRepository.findByIdWithRelations(auctionId);

    if (!auction) throw new NotFoundException('error.auction.not_found');

    const cachedPrice = await this.redisService.getLivePrice(auctionId);

    if (cachedPrice) auction.currentPrice = cachedPrice;

    return new AuctionDetailResponse(auction);
  }

  /**
   * Cancel an auction (only if no one has bid yet)
   * Bidding status is determined by checking if current_price > starting_price
   * @param auctionId - Auction ID
   * @param userId - User ID (must be auction owner)
   * @returns Updated auction
   */
  async cancelAuction(auctionId: number, userId: number): Promise<AuctionResponse> {
    const auction = await this.auctionsRepository.findByIdWithRelations(auctionId);

    if (!auction) throw new NotFoundException('error.auction.not_found');

    if (auction.ownerId !== userId) throw new ForbiddenException('error.auction.cancel_forbidden_not_owner');

    if (auction.status !== AuctionStatus.ACTIVE) throw new BadRequestException('error.auction.cancel_forbidden_not_active');

    if (auction.currentPrice > auction.startingPrice) throw new BadRequestException('error.auction.cancel_forbidden_already_has_bids');

    auction.status = AuctionStatus.CANCELED;
    const updatedAuction = await this.auctionsRepository.save(auction);

    await this.invalidateAuctionsCache();
    await this.invalidatePriceCache(auctionId);

    return new AuctionResponse(updatedAuction);
  }

  /**
   * Update an auction
   * Only the owner can update, and only certain fields can be modified
   * @param auctionId - Auction ID
   * @param updateAuctionDto - Update data
   * @param userId - User ID (must be auction owner)
   * @returns Updated auction
   */
  async updateAuction(auctionId: number, updateAuctionDto: UpdateAuctionDto, userId: number): Promise<AuctionResponse> {
    const auction = await this.auctionsRepository.findOneBy({ id: auctionId });

    if (!auction) throw new NotFoundException('error.auction.not_found');

    if (auction.ownerId !== userId) throw new ForbiddenException('error.auction.update_forbidden_not_owner');

    if (auction.status !== AuctionStatus.ACTIVE) throw new BadRequestException('error.auction.update_forbidden_not_active');

    if (updateAuctionDto.endTime) {
      const newEndTime = new Date(updateAuctionDto.endTime);

      if (newEndTime <= auction.endTime) throw new BadRequestException('error.auction.update_forbidden_end_time');

      auction.endTime = newEndTime;
    }

    if (updateAuctionDto.title) auction.title = updateAuctionDto.title;

    if (updateAuctionDto.description) auction.description = updateAuctionDto.description;

    const updatedAuction = await this.auctionsRepository.save(auction);

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
    if (auction.status !== AuctionStatus.ACTIVE) throw new BadRequestException('error.auction.update_forbidden_not_active');

    const hasNewFiles: boolean = files && files.length > 0;
    const hasExistingUrls: boolean = existingImageUrls && existingImageUrls.length > 0;

    if (!hasNewFiles && !hasExistingUrls) throw new BadRequestException('error.auction.no_images_provided');

    const allExisting = await this.auctionImageRepository.find({ where: { auctionId } });

    const existingAuctionUrls: string[] = allExisting.map((img) => img.imageUrl);
    const invalidUrls: string[] = existingImageUrls.filter((url) => !existingAuctionUrls.includes(url));

    if (invalidUrls.length > 0) throw new BadRequestException('error.validation.auction.invalid_existing_image_urls');

    const toKeep: AuctionImage[] = allExisting.filter((img) => existingImageUrls.includes(img.imageUrl));
    const toDelete: AuctionImage[] = allExisting.filter((img) => !existingImageUrls.includes(img.imageUrl));
    const oldPathsToDelete: string[] = toDelete.map((img) => img.imageUrl.replace('/uploads/', ''));

    const MAX_IMAGES: number = 10;
    const totalCount: number = toKeep.length + (hasNewFiles ? files.length : 0);

    if (totalCount > MAX_IMAGES) throw new BadRequestException(i18n.t('error.auction.too_many_images_#max', { args: { max: MAX_IMAGES } }));

    const uploadedFiles = hasNewFiles ? await this.fileUploadService.uploadMultiple(files, this.fileUploadService.getAuctionImageUploadOptions(), i18n) : [];

    const allUrls = [...toKeep.map((img) => img.imageUrl), ...uploadedFiles.map((f) => f.url)];

    const primaryIndex: number = primaryImageIndex ?? 0;

    if (primaryIndex >= allUrls.length) throw new BadRequestException('error.validation.auction.primaryImageIndex_must_be_valid');

    try {
      await this.auctionsRepository.manager.transaction(async (em) => {
        if (toDelete.length > 0) await em.delete(AuctionImage, { id: In(toDelete.map((img) => img.id)) });

        for (const img of toKeep) {
          const newIsPrimary: boolean = allUrls.indexOf(img.imageUrl) === primaryIndex;

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
