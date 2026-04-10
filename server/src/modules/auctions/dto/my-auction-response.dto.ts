import { ApiProperty } from '@nestjs/swagger';
import { type IAuctionUser } from '../interfaces';
import { AuctionCategory, AuctionStatus } from '../enums';
import { Auction } from '../entities';

export class MyAuctionResponse {
  @ApiProperty({
    description: 'Auction ID',
    example: 1,
  })
  id: number;

  @ApiProperty({
    description: 'Auction title',
    example: 'Vintage Collectible Watch',
  })
  title: string;

  @ApiProperty({
    description: 'Auction description',
    example: 'A rare vintage watch from 1950s in excellent condition',
  })
  description: string;

  @ApiProperty({
    description: 'Auction main image URL',
    example: '2026/04/auctions/2fc0d381e40e96f4.jpg',
  })
  mainImageUrl: string;

  @ApiProperty({
    description: 'Starting price expressed as a whole integer in the smallest currency unit (e.g. grosz: 1005 = 10.05 PLN).',
    example: 1005,
  })
  startingPrice: number;

  @ApiProperty({
    description: 'Current highest bid price expressed as a whole integer in the smallest currency unit (e.g. grosz: 1505 = 15.05 PLN).',
    example: 1505,
  })
  currentPrice: number;

  @ApiProperty({
    description: 'Auction start time',
    example: '2024-03-10T08:00:00Z',
    type: 'string',
    format: 'date-time',
  })
  startTime: Date;

  @ApiProperty({
    description: 'Auction end time',
    example: '2024-03-10T10:00:00Z',
    type: 'string',
    format: 'date-time',
  })
  endTime: Date;

  @ApiProperty({
    description: 'Auction status',
    enum: AuctionStatus,
    example: AuctionStatus.ACTIVE,
  })
  status: AuctionStatus;

  @ApiProperty({
    description: 'Auction category',
    enum: AuctionCategory,
    example: AuctionCategory.ELECTRONICS,
  })
  category: AuctionCategory;

  @ApiProperty({
    description: 'Winner user details',
    example: {
      id: 2,
      firstName: 'Jane',
      lastName: 'Smith',
    },
    nullable: true,
  })
  winner?: IAuctionUser | null;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2024-03-07T10:00:00Z',
    type: 'string',
    format: 'date-time',
  })
  createdAt: Date;

  constructor(auction: Auction) {
    this.id = auction.id;
    this.title = auction.title;
    this.description = auction.description;
    this.mainImageUrl = auction.mainImageUrl;
    this.startingPrice = auction.startingPrice;
    this.currentPrice = auction.currentPrice;
    this.startTime = auction.startTime;
    this.endTime = auction.endTime;
    this.status = auction.status;
    this.category = auction.category;
    this.createdAt = auction.createdAt;

    if (auction.winner) {
      this.winner = {
        id: auction.winner.id,
        firstName: auction.winner.firstName,
        lastName: auction.winner.lastName,
        avatar: auction.winner.avatar,
      };
    } else if (auction.winnerId) {
      this.winner = {
        id: auction.winnerId,
        isDeleted: true,
      };
    }
  }
}
