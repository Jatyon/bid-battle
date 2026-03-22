import { BaseEntity } from '../../../core/entities/base.entity';
import { ApiProperty } from '@nestjs/swagger';
import { BigIntTransformer } from '@core/transformers';
import { Auction } from '../../auctions/entities/auction.entity';
import { User } from '../../users/entities/user.entity';
import { Column, Entity, Index, ManyToOne, JoinColumn, RelationId } from 'typeorm';

@Entity({ name: 'bids' })
@Index(['auctionId', 'amount'])
@Index(['userId'])
@Index(['auctionId', 'createdAt'])
export class Bid extends BaseEntity {
  @ApiProperty({ description: 'Bid amount', example: 150.5 })
  @Column({ name: 'amount', type: 'bigint', unsigned: true, transformer: BigIntTransformer })
  amount: number;

  @ApiProperty({ description: 'Auction ID', example: 1 })
  @Index()
  @Column({ name: 'auction_id', type: 'int', unsigned: true })
  @RelationId((bid: Bid) => bid.auction)
  auctionId: number;

  @ManyToOne(() => Auction, (auction) => auction.bids)
  @JoinColumn({ name: 'auction_id', referencedColumnName: 'id' })
  auction: Auction;

  @ApiProperty({ description: 'User ID who placed the bid', example: 2 })
  @Index()
  @Column({ name: 'user_id', type: 'int', unsigned: true })
  @RelationId((bid: Bid) => bid.user)
  userId: number;

  @ManyToOne(() => User, (user) => user.bids)
  @JoinColumn({ name: 'user_id', referencedColumnName: 'id' })
  user: User;
}
