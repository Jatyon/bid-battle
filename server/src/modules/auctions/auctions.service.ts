import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Paginator, PaginatorResponse } from '@core/models';
import { RedisService } from '@shared/redis';
import { AuctionDetailResponse, AuctionResponse, CreateAuctionDto } from './dto';
import { AuctionsRepository } from './repositories/auctions.repository';
import { AuctionStatus } from './enums';
import { Auction } from './entities';

@Injectable()
export class AuctionsService {
  constructor(
    private readonly auctionsRepository: AuctionsRepository,
    private readonly redisService: RedisService,
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
