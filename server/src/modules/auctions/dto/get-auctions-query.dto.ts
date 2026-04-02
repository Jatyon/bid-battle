import { ApiPropertyOptional } from '@nestjs/swagger';
import { BasePaginatedSearchDto } from '@core/dto';
import { AuctionSortBy } from '../enums';
import { IsOptional, IsNumber, IsEnum, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GetAuctionsQueryDto extends BasePaginatedSearchDto {
  @ApiPropertyOptional({
    description: 'Minimum current price filter (in smallest currency unit)',
    example: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'error.validation.min_price_must_be_number' })
  @Min(0, { message: 'error.validation.min_price_must_be_non_negative' })
  minPrice?: number;

  @ApiPropertyOptional({
    description: 'Maximum current price filter (in smallest currency unit)',
    example: 50000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'error.validation.max_price_must_be_number' })
  @Min(0, { message: 'error.validation.max_price_must_be_non_negative' })
  maxPrice?: number;

  @ApiPropertyOptional({
    description: 'Field to sort results by',
    enum: AuctionSortBy,
    default: AuctionSortBy.CREATED_AT,
  })
  @IsOptional()
  @IsEnum(AuctionSortBy, { message: 'error.validation.sort_by_invalid' })
  sortBy?: AuctionSortBy = AuctionSortBy.CREATED_AT;
}
