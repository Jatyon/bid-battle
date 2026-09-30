import type { AuctionCategory } from '@core/enums';

export type { AuctionCategory } from '@core/enums';

export type AuctionSortBy = 'createdAt' | 'endTime' | 'currentPrice';
export type SortOrder = 'ASC' | 'DESC';

export interface Auction {
  id: number;
  title: string;
  description: string;
  mainImageUrl: string;
  startingPrice: number;
  currentPrice: number;
  startTime: string;
  endTime: string;
  status: 'PENDING' | 'ACTIVE' | 'ENDED' | 'CANCELED';
  category: AuctionCategory;
  createdAt: string;
  owner?: {
    id: number;
    firstName?: string;
    lastName?: string;
    avatar?: string;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

export interface AuctionSearchQuery {
  page: number;
  limit: number;
  search?: string;
  category?: AuctionCategory;
  minPrice?: number;
  maxPrice?: number;
  sortBy: AuctionSortBy;
  sortOrder: SortOrder;
}

export interface AuctionListFilters {
  search?: string;
  category?: AuctionCategory;
  minPrice?: number;
  maxPrice?: number;
  sortBy: AuctionSortBy;
  sortOrder: SortOrder;
}
