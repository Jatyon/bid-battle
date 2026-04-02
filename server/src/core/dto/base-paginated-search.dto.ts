import { ApiPropertyOptional } from '@nestjs/swagger';
import { Paginator } from '@core/models';
import { SortOrder } from '@core/enums';
import { IsOptional, IsString, IsEnum, MaxLength } from 'class-validator';

/**
 * Base DTO for paginated list endpoints that support a free-text search and sort order.
 * Extend this class and add domain-specific filters (e.g. price range, category).
 *
 * Inherits page / limit / skip / response() from Paginator.
 */
export class BasePaginatedSearchDto extends Paginator {
  @ApiPropertyOptional({
    description: 'Free-text search phrase (partial, case-insensitive match)',
    example: 'vintage watch',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'error.validation.search_too_long' })
  search?: string;

  @ApiPropertyOptional({
    description: 'Sort direction',
    enum: SortOrder,
    default: SortOrder.DESC,
  })
  @IsOptional()
  @IsEnum(SortOrder, { message: 'error.validation.sort_order_invalid' })
  sortOrder?: SortOrder = SortOrder.DESC;
}
