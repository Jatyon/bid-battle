import { Bid } from '../../bid/entities/bid.entity';
import { ApiProperty } from '@nestjs/swagger';
import { type IAuctionUser } from '@modules/auctions';

export class BidResponse {
  @ApiProperty({ description: 'Bid ID', example: 1 })
  id: number;

  @ApiProperty({ description: 'Bid amount', example: 1505 })
  amount: number;

  @ApiProperty({ description: 'Auction ID', example: 1 })
  auctionId: number;

  @ApiProperty({ description: 'User ID who placed the bid', example: 2 })
  userId: number;

  @ApiProperty({
    description: 'User details (partially masked for privacy in public view)',
    example: {
      id: 2,
      firstName: 'Jane',
      lastName: 'S.',
      avatar: '/uploads/avatars/2.jpg',
    },
    nullable: true,
  })
  user?: IAuctionUser;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2024-03-07T10:00:00Z',
    type: 'string',
    format: 'date-time',
  })
  createdAt: Date;

  constructor(bid: Bid, includeUser = false) {
    this.id = bid.id;
    this.amount = bid.amount;
    this.auctionId = bid.auctionId;
    this.userId = bid.userId;
    this.createdAt = bid.createdAt;

    if (includeUser) {
      if (bid.user) {
        this.user = {
          id: bid.userId,
          firstName: bid.user.firstName,
          lastName: bid.user.lastName ? `${bid.user.lastName.charAt(0)}.` : undefined,
          avatar: bid.user.avatar,
        };
      } else {
        this.user = {
          id: bid.userId,
          isDeleted: true,
        };
      }
    }
  }
}
