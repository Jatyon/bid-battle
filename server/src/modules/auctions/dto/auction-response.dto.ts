import { ApiProperty } from '@nestjs/swagger';
import { type IAuctionUser } from '../interfaces';
import { AuctionStatus } from '../enums';
import { Auction } from '../entities';

export class AuctionResponse {
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
    example: '/uploads/2026/03/abc-123.jpg',
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
    description: 'Owner user ID',
    example: 1,
  })
  ownerId: number;

  @ApiProperty({
    description: 'Owner user details',
    example: {
      id: 1,
      email: 'owner@example.com',
      firstName: 'John',
      lastName: 'Doe',
    },
    nullable: true,
  })
  owner?: IAuctionUser;

  @ApiProperty({
    description: 'Winner user ID (null if auction is still active)',
    example: 2,
    nullable: true,
  })
  winnerId?: number | null;

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

  constructor(auction: Auction, includeOwner = false, includeWinner = false) {
    this.id = auction.id;
    this.title = auction.title;
    this.description = auction.description;
    this.mainImageUrl = auction.mainImageUrl;
    this.startingPrice = auction.startingPrice;
    this.currentPrice = auction.currentPrice;
    this.startTime = auction.startTime;
    this.endTime = auction.endTime;
    this.status = auction.status;
    this.ownerId = auction.ownerId;
    this.winnerId = auction.winnerId;
    this.createdAt = auction.createdAt;

    if (includeOwner) {
      if (auction.owner) {
        this.owner = {
          id: auction.owner.id,
          firstName: auction.owner.firstName,
          lastName: auction.owner.lastName,
          avatar: auction.owner.avatar,
        };
      } else {
        this.owner = {
          id: auction.ownerId,
          isDeleted: true,
        };
      }
    }

    if (includeWinner) {
      if (auction.winner) {
        this.winner = {
          id: auction.winner.id,
          firstName: auction.winner.firstName,
          lastName: auction.winner.lastName,
          avatar: auction.winner.avatar,
        };
      } else if (auction.winnerId) {
        this.winner = {
          id: auction.ownerId,
          isDeleted: true,
        };
      }
    }
  }
}
