import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsDateString, IsNotEmpty, Min, IsArray, IsOptional, IsInt, ArrayMinSize } from 'class-validator';
import { registerDecorator, ValidationOptions } from 'class-validator';
import { addHours, isAfter } from 'date-fns';

export class CreateAuctionDto {
  @ApiProperty({
    description: 'Auction title',
    example: 'Vintage Collectible Watch',
  })
  @IsNotEmpty({ message: 'error.validation.auction.title_required' })
  @IsString({ message: 'error.validation.auction.title_must_be_string' })
  title: string;

  @ApiProperty({
    description: 'Auction description',
    example: 'A rare vintage watch from 1950s in excellent condition',
  })
  @IsNotEmpty({ message: 'error.validation.auction.description_required' })
  @IsString({ message: 'error.validation.auction.description_must_be_string' })
  description: string;

  @ApiProperty({
    description: 'Starting price (must be greater than 0)',
    example: 1005,
  })
  @IsNotEmpty({ message: 'error.validation.auction.starting_price_required' })
  @IsInt({ message: 'error.validation.auction.starting_price_must_be_integer' })
  @Min(1, { message: 'error.validation.auction.starting_price_must_be_positive' })
  startingPrice: number;

  @ApiProperty({
    description: 'Auction end time (must be at least 1 hour in the future)',
    example: '2026-03-10T10:00:00Z',
    type: 'string',
    format: 'date-time',
  })
  @IsNotEmpty({ message: 'error.validation.auction.end_time_required' })
  @IsDateString({ strict: false }, { message: 'error.validation.auction.end_time_must_be_datetime' })
  @IsFutureDateString(1, {
    message: 'error.validation.auction.end_time_must_be_at_least_one_hour_from_now',
  })
  endTime: string;

  @ApiProperty({
    description: 'Array of auction image URLs (at least one image is required)',
    type: [String],
    example: ['/uploads/2026/03/abc-123.jpg', '/uploads/2026/03/def-456.jpg'],
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'error.validation.auction.images_must_have_at_least_one_image' })
  @IsString({ each: true })
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
