import { BaseEntity } from '../../../core/entities/base.entity';
import { ApiProperty } from '@nestjs/swagger';
import { Auction } from './auction.entity';
import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';

@Entity({ name: 'auction_images' })
export class AuctionImage extends BaseEntity {
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

  @ManyToOne(() => Auction, (auction) => auction.images, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'auction_id' })
  auction: Auction;
}
