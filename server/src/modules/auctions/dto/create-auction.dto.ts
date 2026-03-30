import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsDateString, IsNotEmpty, Min, Max, IsArray, IsOptional, IsInt, ArrayMinSize, MaxLength, Matches, ArrayMaxSize } from 'class-validator';
import { registerDecorator, ValidationOptions } from 'class-validator';
import { addHours, isAfter, isBefore } from 'date-fns';
import { AUCTION_MAX_DURATION_HOURS, AUCTION_PRICE_MAX } from '../auction.constants';

export class CreateAuctionDto {
  @ApiProperty({
    description: 'Auction title',
    example: 'Vintage Collectible Watch',
  })
  @IsNotEmpty({ message: 'error.validation.auction.title_required' })
  @IsString({ message: 'error.validation.auction.title_must_be_string' })
  @MaxLength(255, { message: 'error.validation.auction.title_too_long' })
  title: string;

  @ApiProperty({
    description: 'Auction description',
    example: 'A rare vintage watch from 1950s in excellent condition',
  })
  @IsNotEmpty({ message: 'error.validation.auction.description_required' })
  @IsString({ message: 'error.validation.auction.description_must_be_string' })
  @MaxLength(5000, { message: 'error.validation.auction.description_too_long' })
  description: string;

  @ApiProperty({
    description: 'Starting price expressed as a whole integer in the smallest currency unit ' + '(e.g. grosz: 100 = 1.00 PLN). Must be between 1 and 999 999 999.',
    example: 1000,
  })
  @IsNotEmpty({ message: 'error.validation.auction.starting_price_required' })
  @IsInt({ message: 'error.validation.auction.starting_price_must_be_integer' })
  @Min(1, { message: 'error.validation.auction.starting_price_must_be_positive' })
  @Max(AUCTION_PRICE_MAX, { message: 'error.validation.auction.starting_price_too_high' })
  startingPrice: number;

  @ApiProperty({
    description: 'Auction start time (optional, defaults to now). Must be in the future.',
    example: '2026-03-20T12:00:00Z',
    type: 'string',
    format: 'date-time',
    required: false,
  })
  @IsOptional()
  @IsDateString({ strict: false }, { message: 'error.validation.auction.start_time_must_be_datetime' })
  startTime?: string;

  @ApiProperty({
    description: `Auction end time (must be at least 1 hour and at most ${AUCTION_MAX_DURATION_HOURS} hours in the future)`,
    example: '2026-03-10T10:00:00Z',
    type: 'string',
    format: 'date-time',
  })
  @IsNotEmpty({ message: 'error.validation.auction.end_time_required' })
  @IsDateString({ strict: false }, { message: 'error.validation.auction.end_time_must_be_datetime' })
  @IsFutureDateString(1, {
    message: 'error.validation.auction.end_time_must_be_at_least_one_hour_from_now',
  })
  @IsWithinMaxDurationFromNow(AUCTION_MAX_DURATION_HOURS, {
    message: 'error.validation.auction.end_time_exceeds_max_duration',
  })
  endTime: string;

  @ApiProperty({
    description: 'Array of auction image URLs (at least one image is required)',
    type: [String],
    example: ['/uploads/2026/03/abc-123.jpg', '/uploads/2026/03/def-456.jpg'],
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'error.validation.auction.images_must_have_at_least_one_image' })
  @ArrayMaxSize(10, { message: 'error.validation.auction.images_too_many' })
  @IsString({ each: true, message: 'error.validation.auction.image_url_must_be_string' })
  @Matches(/^\/uploads\/[\w\-/.]+$/, {
    each: true,
    message: 'error.validation.auction.image_url_invalid_format',
  })
  imageUrls: string[];

  @ApiProperty({
    description: 'Index of primary image (optional, defaults to 0)',
    example: 0,
    required: false,
  })
  @IsOptional()
  @IsInt({ message: 'error.validation.auction.primary_image_index_must_be_integer' })
  @Min(0, { message: 'error.validation.auction.primary_image_index_must_be_non_negative' })
  primaryImageIndex?: number;
}

export function IsFutureDateString(hoursToAdd: number, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isFutureDateString',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (typeof value !== 'string') return false;

          const dateValue = new Date(value);
          if (isNaN(dateValue.getTime())) return false;

          const minDate = addHours(new Date(), hoursToAdd);

          return isAfter(dateValue, minDate);
        },
      },
    });
  };
}

export function IsWithinMaxDurationFromNow(maxHours: number, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isWithinMaxDurationFromNow',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (typeof value !== 'string') return false;

          const dateValue = new Date(value);
          if (isNaN(dateValue.getTime())) return false;

          const maxDate = addHours(new Date(), maxHours);

          return isBefore(dateValue, maxDate);
        },
      },
    });
  };
}
