import { SortOrder } from '@core/enums';
import { AuctionCategory, AuctionSortBy, AuctionStatus } from '../enums';

export interface IAuctionFilters {
  search?: string;
  category?: AuctionCategory;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: AuctionSortBy;
  sortOrder?: SortOrder;
}

export interface IMyAuctionFilters {
  search?: string;
  status?: AuctionStatus;
  category?: AuctionCategory;
  hasWinner?: boolean;
  sortBy?: AuctionSortBy;
  sortOrder?: SortOrder;
}
