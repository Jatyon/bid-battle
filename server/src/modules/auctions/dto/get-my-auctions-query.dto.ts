import { ApiPropertyOptional } from '@nestjs/swagger';
import { BasePaginatedSearchDto } from '@core/dto';
import { AuctionCategory, AuctionSortBy, AuctionStatus } from '../enums';
import { IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';

export class GetMyAuctionsQueryDto extends BasePaginatedSearchDto {
  @ApiPropertyOptional({
    description: 'Filter by auction status',
    enum: AuctionStatus,
  })
  @IsOptional()
  @IsEnum(AuctionStatus, { message: 'error.validation.auction.status_invalid' })
  status?: AuctionStatus;

  @ApiPropertyOptional({
    description: 'Filter by category',
    enum: AuctionCategory,
  })
  @IsOptional()
  @IsEnum(AuctionCategory, { message: 'error.validation.auction.category_invalid' })
  category?: AuctionCategory;

  @ApiPropertyOptional({
    description: 'Filter by whether the auction has a winner',
    type: Boolean,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true || value === 1 || value === '1') return true;
    if (value === 'false' || value === false || value === 0 || value === '0') return false;
    return undefined;
  })
  @IsBoolean()
  hasWinner?: boolean;

  @ApiPropertyOptional({
    description: 'Field to sort results by',
    enum: AuctionSortBy,
    default: AuctionSortBy.CREATED_AT,
  })
  @IsOptional()
  @IsEnum(AuctionSortBy, { message: 'error.validation.sort_by_invalid' })
  sortBy?: AuctionSortBy = AuctionSortBy.CREATED_AT;
}
