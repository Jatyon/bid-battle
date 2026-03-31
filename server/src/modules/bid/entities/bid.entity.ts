import { ApiProperty } from '@nestjs/swagger';
import { BigIntTransformer } from '@core/transformers';
import { Auction } from '../../auctions/entities/auction.entity';
import { User } from '../../users/entities/user.entity';
import { Column, Entity, Index, ManyToOne, JoinColumn, RelationId, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'bids' })
@Index(['auctionId', 'amount'])
@Index(['userId'])
@Index(['auctionId', 'createdAt'])
export class Bid {
  @ApiProperty({
    description: 'Unique identifier',
    example: 1,
  })
  @PrimaryGeneratedColumn('increment', { type: 'int' })
  id: number;

  @ApiProperty({ description: 'Bid amount expressed as a whole integer in the smallest currency unit (e.g. grosz: 1505 = 15.05 PLN).', example: 1505 })
  @Column({ name: 'amount', type: 'bigint', unsigned: true, transformer: BigIntTransformer })
  amount: number;

  @ApiProperty({ description: 'Auction ID', example: 1 })
  @Index()
  @Column({ name: 'auction_id', type: 'int', unsigned: true })
  @RelationId((bid: Bid) => bid.auction)
  auctionId: number;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2024-03-07T10:00:00Z',
    type: 'string',
    format: 'date-time',
  })
  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2024-03-07T10:30:00Z',
    type: 'string',
    format: 'date-time',
  })
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

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
