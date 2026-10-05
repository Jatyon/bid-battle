import { SortOrder } from '@core/enums';
import { AuctionCategory, AuctionStatus } from '@modules/auctions/enums';
import { BidSortBy, MyBidStatusFilter } from '../enums';

export interface IMyBidFilters {
  search?: string;
  category?: AuctionCategory;
  auctionStatus?: AuctionStatus;
  bidStatus?: MyBidStatusFilter;
  sortBy?: BidSortBy;
  sortOrder?: SortOrder;
}
