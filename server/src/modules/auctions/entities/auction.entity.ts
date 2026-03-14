import { BaseEntity } from '../../../core/entities/base.entity';
import { ApiProperty } from '@nestjs/swagger';
import { User } from '@modules/users/entities/user.entity';
import { AuctionImage } from './auction-images.entity';
import { AuctionStatus } from '../enums';
import { Column, Entity, Index, ManyToOne, JoinColumn, RelationId, OneToMany } from 'typeorm';
import { BigIntTransformer } from '@core/transformers';

@Entity({ name: 'auctions' })
@Index(['status', 'endTime'])
@Index(['ownerId'])
@Index(['winnerId'])
export class Auction extends BaseEntity {
  @ApiProperty({
    description: 'Auction title',
    example: 'Vintage Collectible Watch',
  })
  @Column({ name: 'title', type: 'varchar', length: 255 })
  title: string;

  @ApiProperty({
    description: 'Auction description',
    example: 'A rare vintage watch from 1950s in excellent condition',
  })
  @Column({ name: 'description', type: 'text' })
  description: string;

  @ApiProperty({
    description: 'Image URL',
    example: 'https://example.com/image.jpg',
    nullable: true,
  })
  @Column({ name: 'main_image_url', type: 'varchar', length: 500 })
  mainImageUrl: string;

  @ApiProperty({
    description: 'Starting price',
    example: 1005,
  })
  @Column({ name: 'starting_price', type: 'bigint', unsigned: true, transformer: BigIntTransformer })
  startingPrice: number;

  @ApiProperty({
    description: 'Current highest bid price (denormalized for optimization)',
    example: 1505,
  })
  @Column({ name: 'current_price', type: 'bigint', unsigned: true, transformer: BigIntTransformer })
  currentPrice: number;

  @ApiProperty({
    description: 'Auction end time',
    example: '2024-03-10T10:00:00Z',
    type: 'string',
    format: 'date-time',
  })
  @Column({ name: 'end_time', type: 'timestamp' })
  endTime: Date;

  @ApiProperty({
    description: 'Auction status',
    enum: AuctionStatus,
    example: AuctionStatus.ACTIVE,
  })
  @Index()
  @Column({ name: 'status', type: 'enum', enum: AuctionStatus, default: AuctionStatus.ACTIVE })
  status: AuctionStatus;

  @ApiProperty({
    description: 'Owner user ID',
    example: 1,
  })
  @Index()
  @Column({ name: 'owner_id', type: 'int', unsigned: true })
  @RelationId((auction: Auction) => auction.owner)
  ownerId: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'owner_id', referencedColumnName: 'id' })
  owner: User;

  @ApiProperty({
    description: 'Winner user ID (null if auction is still active or no bids)',
    example: 2,
    nullable: true,
  })
  @Index()
  @Column({ name: 'winner_id', type: 'int', unsigned: true, nullable: true })
  @RelationId((auction: Auction) => auction.winner)
  winnerId?: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'winner_id', referencedColumnName: 'id' })
  winner?: User | null;

  @OneToMany(() => AuctionImage, (auctionImage) => auctionImage.auction, { cascade: true })
  images: AuctionImage[];
}
