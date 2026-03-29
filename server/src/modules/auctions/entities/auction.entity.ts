import { ApiProperty } from '@nestjs/swagger';
import { BigIntTransformer } from '@core/transformers';
import { AuctionImage } from './auction-images.entity';
import { AuctionStatus } from '../enums';
import { User } from '../../users/entities/user.entity';
import { Bid } from '../../bid/entities/bid.entity';
import { Column, Entity, Index, ManyToOne, JoinColumn, RelationId, OneToMany, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Exclude } from 'class-transformer';

@Entity({ name: 'auctions' })
@Index(['status', 'endTime'])
@Index(['ownerId'])
@Index(['ownerId', 'createdAt'])
@Index(['winnerId'])
export class Auction {
  @ApiProperty({
    description: 'Unique identifier',
    example: 1,
  })
  @PrimaryGeneratedColumn('increment', { type: 'int' })
  id: number;

  @ApiProperty({ description: 'Auction title', example: 'Vintage Collectible Watch' })
  @Column({ name: 'title', type: 'varchar', length: 255 })
  title: string;

  @ApiProperty({ description: 'Auction description', example: 'A rare vintage watch from 1950s in excellent condition' })
  @Column({ name: 'description', type: 'text' })
  description: string;

  @ApiProperty({ description: 'Image URL', nullable: true })
  @Column({ name: 'main_image_url', type: 'varchar', length: 500 })
  mainImageUrl: string;

  @ApiProperty({ description: 'Starting price', example: 1005 })
  @Column({ name: 'starting_price', type: 'bigint', unsigned: true, transformer: BigIntTransformer })
  startingPrice: number;

  @ApiProperty({ description: 'Current highest bid price', example: 1505 })
  @Column({ name: 'current_price', type: 'bigint', unsigned: true, transformer: BigIntTransformer })
  currentPrice: number;

  @ApiProperty({ description: 'Auction start time', type: 'string', format: 'date-time' })
  @Column({ name: 'start_time', type: 'timestamp' })
  startTime: Date;

  @ApiProperty({ description: 'Auction end time', type: 'string', format: 'date-time' })
  @Column({ name: 'end_time', type: 'timestamp' })
  endTime: Date;

  @ApiProperty({ description: 'Actual time when auction was activated', type: 'string', format: 'date-time', nullable: true })
  @Column({ name: 'started_at', type: 'timestamp', nullable: true })
  startedAt: Date | null;

  @ApiProperty({ description: 'Actual time when auction ended', type: 'string', format: 'date-time', nullable: true })
  @Column({ name: 'ended_at', type: 'timestamp', nullable: true })
  endedAt: Date | null;

  @ApiProperty({ description: 'Auction status', enum: AuctionStatus, example: AuctionStatus.PENDING })
  @Index()
  @Column({ name: 'status', type: 'enum', enum: AuctionStatus, default: AuctionStatus.PENDING })
  status: AuctionStatus;

  @ApiProperty({ description: 'Owner user ID', example: 1 })
  @Index()
  @Column({ name: 'owner_id', type: 'int', unsigned: true })
  @RelationId((auction: Auction) => auction.owner)
  ownerId: number;

  @ManyToOne(() => User, (user) => user.auctionsOwned)
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

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2024-03-07T10:00:00Z',
    type: 'string',
    format: 'date-time',
  })
  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  @Exclude()
  updatedAt: Date;

  @ManyToOne(() => User, (user) => user.auctionsWon, { nullable: true })
  @JoinColumn({ name: 'winner_id', referencedColumnName: 'id' })
  winner?: User | null;

  @OneToMany(() => AuctionImage, (auctionImage) => auctionImage.auction, { cascade: true })
  images: AuctionImage[];

  @OneToMany(() => Bid, (bid) => bid.auction)
  bids: Bid[];
}
