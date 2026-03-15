import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsDateString, IsOptional } from 'class-validator';

export class UpdateAuctionDto {
  @ApiProperty({
    description: 'Auction title',
    example: 'Vintage Collectible Watch',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'error.validation.auction.title_must_be_string' })
  title?: string;

  @ApiProperty({
    description: 'Auction description',
    example: 'A rare vintage watch from 1950s in excellent condition',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'error.validation.auction.description_must_be_string' })
  description?: string;

  @ApiProperty({
    description: 'Auction end time (can only be extended, not shortened)',
    example: '2026-03-15T10:00:00Z',
    type: 'string',
    format: 'date-time',
    required: false,
  })
  @IsOptional()
  @IsDateString({ strict: false }, { message: 'error.validation.auction.end_time_must_be_datetime' })
  endTime?: string;
}
