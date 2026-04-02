import { SortOrder } from '@core/enums';
import { AuctionCategory, AuctionSortBy } from '../enums';

export interface IAuctionFilters {
  search?: string;
  category?: AuctionCategory;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: AuctionSortBy;
  sortOrder?: SortOrder;
}
