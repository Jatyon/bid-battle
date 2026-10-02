import { ApiProperty } from '@nestjs/swagger';
import { IsFutureDateString, IsNotTooFarInPast, IsWithinMaxDurationFromNow } from './create-auction.dto';
import { AUCTION_MAX_DURATION_HOURS } from '../auction.constants';
import { AUCTION_PRICE_MAX } from '../auction.constants';
import { AuctionCategory } from '../enums';
import { IsString, IsDateString, IsOptional, MaxLength, IsEnum, IsInt, Min, Max } from 'class-validator';

export class UpdateAuctionDto {
  @ApiProperty({
    description: 'Auction title',
    example: 'Vintage Collectible Watch',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'error.validation.auction.title_must_be_string' })
  @MaxLength(255, { message: 'error.validation.auction.title_too_long' })
  title?: string;

  @ApiProperty({
    description: 'Auction description',
    example: 'A rare vintage watch from 1950s in excellent condition',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'error.validation.auction.description_must_be_string' })
  @MaxLength(5000, { message: 'error.validation.auction.description_too_long' })
  description?: string;

  @ApiProperty({
    description: 'Text to append to the existing description (used when auction has bids)',
    example: 'Update: Original packaging found!',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'error.validation.auction.description_must_be_string' })
  @MaxLength(1000, { message: 'error.validation.auction.append_description_too_long' })
  appendDescription?: string;

  @ApiProperty({
    description: 'Starting price expressed as a whole integer in the smallest currency unit. Can only be updated if no bids exist.',
    example: 1000,
    required: false,
  })
  @IsOptional()
  @IsInt({ message: 'error.validation.auction.starting_price_must_be_integer' })
  @Min(1, { message: 'error.validation.auction.starting_price_must_be_positive' })
  @Max(AUCTION_PRICE_MAX, { message: 'error.validation.auction.starting_price_too_high' })
  startingPrice?: number;

  @ApiProperty({
    description: `Auction end time (can only be extended, not shortened, must be in the future and within ${AUCTION_MAX_DURATION_HOURS}h from now)`,
    example: '2026-03-15T10:00:00Z',
    type: 'string',
    format: 'date-time',
    required: false,
  })
  @IsOptional()
  @IsDateString({ strict: false }, { message: 'error.validation.auction.end_time_must_be_datetime' })
  @IsFutureDateString(0, { message: 'error.validation.auction.end_time_must_be_in_future' })
  @IsWithinMaxDurationFromNow(AUCTION_MAX_DURATION_HOURS, {
    message: 'error.validation.auction.end_time_exceeds_max_duration',
  })
  endTime?: string;

  @ApiProperty({
    description: 'Auction start time (optional). Can only be updated if auction is PENDING. Must not be significantly in the past (5-minute clock-skew tolerance).',
    example: '2026-03-20T12:00:00Z',
    type: 'string',
    format: 'date-time',
    required: false,
  })
  @IsOptional()
  @IsDateString({ strict: false }, { message: 'error.validation.auction.start_time_must_be_datetime' })
  @IsNotTooFarInPast(5, { message: 'error.validation.auction.start_time_must_be_in_future' })
  startTime?: string;

  @ApiProperty({
    description: 'Auction category',
    enum: AuctionCategory,
    example: AuctionCategory.ELECTRONICS,
    required: false,
  })
  @IsOptional()
  @IsEnum(AuctionCategory, { message: 'error.validation.auction.category_invalid' })
  category?: AuctionCategory;
}
