import { BadRequestException, Injectable } from '@nestjs/common';
import { Paginator, PaginatorResponse } from '@core/models';
import { RedisService } from '@shared/redis';
import { AuctionsRepository } from './repositories/auctions.repository';
import { AuctionResponse, CreateAuctionDto } from './dto';
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
}
