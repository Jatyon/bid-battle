import { ApiProperty } from '@nestjs/swagger';
import { User } from '@modules/users/entities/user.entity';
import { AuctionStatus } from '../enums';
import { Auction } from '../entities';

export class AuctionDetailResponse {
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
    description: 'Starting price',
    example: 1005,
  })
  startingPrice: number;

  @ApiProperty({
    description: 'Current highest bid price',
    example: 1505,
  })
  currentPrice: number;

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
  owner?: Partial<User>;

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
      email: 'winner@example.com',
      firstName: 'Jane',
      lastName: 'Smith',
    },
    nullable: true,
  })
  winner?: Partial<User> | null;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2024-03-07T10:00:00Z',
    type: 'string',
    format: 'date-time',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2024-03-07T10:30:00Z',
    type: 'string',
    format: 'date-time',
  })
  updatedAt: Date;

  @ApiProperty({
    description: 'Auction images',
    example: ['/uploads/2026/03/abc-123.jpg', '/uploads/2026/03/def-456.jpg'],
  })
  images: string[];

  constructor(auction: Auction) {
    this.id = auction.id;
    this.title = auction.title;
    this.description = auction.description;
    this.mainImageUrl = auction.mainImageUrl;
    this.startingPrice = auction.startingPrice;
    this.currentPrice = auction.currentPrice;
    this.endTime = auction.endTime;
    this.status = auction.status;
    this.ownerId = auction.ownerId;
    this.winnerId = auction.winnerId;
    this.createdAt = auction.createdAt;
    this.images = auction.images.map((img) => img.imageUrl);

    this.owner = {
      id: auction.owner.id,
      email: auction.owner.email,
      firstName: auction.owner.firstName,
      lastName: auction.owner.lastName,
      avatar: auction.owner.avatar,
    };

    if (auction.winner)
      this.winner = {
        id: auction.winner.id,
        email: auction.winner.email,
        firstName: auction.winner.firstName,
        lastName: auction.winner.lastName,
        avatar: auction.winner.avatar,
      };
  }
}
