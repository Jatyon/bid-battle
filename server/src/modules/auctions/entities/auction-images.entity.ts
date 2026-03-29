import { ApiProperty } from '@nestjs/swagger';
import { Auction } from './auction.entity';
import { Column, Entity, ManyToOne, JoinColumn, PrimaryGeneratedColumn, UpdateDateColumn, CreateDateColumn } from 'typeorm';

@Entity({ name: 'auction_images' })
export class AuctionImage {
  @ApiProperty({
    description: 'Unique identifier',
    example: 1,
  })
  @PrimaryGeneratedColumn('increment', { type: 'int' })
  id: number;

  @ApiProperty({
    description: 'Image URL',
    example: 'https://example.com/image.jpg',
    nullable: true,
  })
  @Column({ name: 'image_url', type: 'varchar', length: 500 })
  imageUrl: string;

  @ApiProperty({
    description: 'Indicates if this image is the primary image for the auction',
    example: false,
  })
  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary: boolean;

  @Column({ name: 'auction_id' })
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

  @ManyToOne(() => Auction, (auction) => auction.images, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'auction_id' })
  auction: Auction;
}
