import { SortOrder } from '@core/enums';
import { AuctionSortBy } from '../enums';

export interface IAuctionFilters {
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: AuctionSortBy;
  sortOrder?: SortOrder;
}
