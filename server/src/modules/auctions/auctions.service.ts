import { Injectable } from '@nestjs/common';
import { AuctionsRepository } from './repositories/auctions.repository';
import { AuctionResponse } from './models';
import { CreateAuctionDto } from './dto';
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
    let primaryImage = createAuctionDto.images.find((img) => img.isPrimary);

    if (!primaryImage) primaryImage = createAuctionDto.images[0];

    const mappedImages = createAuctionDto.images.map((img) => ({
      imageUrl: img.url,
      isPrimary: img.url === primaryImage.url,
    }));

    const auction: Auction = this.auctionsRepository.create({
      title: createAuctionDto.title,
      description: createAuctionDto.description,
      startingPrice: createAuctionDto.startingPrice,
      endTime: createAuctionDto.endTime,
      ownerId,
      currentPrice: createAuctionDto.startingPrice,
      status: AuctionStatus.ACTIVE,
      mainImageUrl: primaryImage.url,
      images: mappedImages,
    });

    const savedAuction: Auction = await this.auctionsRepository.save(auction);

    return new AuctionResponse(savedAuction);
  }
}
