import { BadRequestException, Injectable } from '@nestjs/common';
import { AuctionsRepository } from './repositories/auctions.repository';
import { AuctionResponse, CreateAuctionDto } from './dto';
import { AuctionStatus } from './enums';
import { Auction } from './entities';

@Injectable()
export class AuctionsService {
  constructor(private readonly auctionsRepository: AuctionsRepository) {}

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
}
