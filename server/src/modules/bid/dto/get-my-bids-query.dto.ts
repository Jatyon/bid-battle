import { ApiPropertyOptional } from '@nestjs/swagger';
import { BasePaginatedSearchDto } from '@core/dto';
import { AuctionCategory, AuctionStatus } from '@modules/auctions/enums';
import { BidSortBy, MyBidStatusFilter } from '../enums';
import { IsOptional, IsEnum } from 'class-validator';

export class GetMyBidsQueryDto extends BasePaginatedSearchDto {
  @ApiPropertyOptional({
    description: 'Filter by bid status (WINNING, OUTBID, WON, LOST)',
    enum: MyBidStatusFilter,
  })
  @IsOptional()
  @IsEnum(MyBidStatusFilter, { message: 'error.validation.bid.status_invalid' })
  bidStatus?: MyBidStatusFilter;

  @ApiPropertyOptional({
    description: 'Filter by auction status (ACTIVE, ENDED)',
    enum: AuctionStatus,
  })
  @IsOptional()
  @IsEnum(AuctionStatus, { message: 'error.validation.auction.status_invalid' })
  auctionStatus?: AuctionStatus;

  @ApiPropertyOptional({
    description: 'Filter by auction category',
    enum: AuctionCategory,
  })
  @IsOptional()
  @IsEnum(AuctionCategory, { message: 'error.validation.auction.category_invalid' })
  category?: AuctionCategory;

  @ApiPropertyOptional({
    description: 'Field to sort bids by',
    enum: BidSortBy,
    default: BidSortBy.CREATED_AT,
  })
  @IsOptional()
  @IsEnum(BidSortBy, { message: 'error.validation.sort_by_invalid' })
  sortBy?: BidSortBy = BidSortBy.CREATED_AT;
}
