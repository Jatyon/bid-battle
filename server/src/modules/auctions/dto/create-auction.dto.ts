import { ApiProperty } from '@nestjs/swagger';
import { AuctionImageDto } from './image-auction.dto';
import { IsString, IsDateString, IsNotEmpty, Min, IsNumber, IsArray, ValidateNested, ArrayMinSize } from 'class-validator';
import { registerDecorator, ValidationOptions } from 'class-validator';
import { addHours, isAfter } from 'date-fns';
import { Type } from 'class-transformer';

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
    example: 100.5,
  })
  @IsNotEmpty({ message: 'error.validation.auction.starting_price_required' })
  @IsNumber({}, { message: 'error.validation.auction.starting_price_must_be_decimal' })
  @Min(0.01, { message: 'error.validation.auction.starting_price_must_be_positive' })
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
    description: 'Array of auction images (at least one image is required)',
    type: [AuctionImageDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1, { message: 'error.validation.auction.images_must_have_at_least_one_image' })
  @Type(() => AuctionImageDto)
  images: AuctionImageDto[];
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
