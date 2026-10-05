import type { AuctionCategory, SortOrder } from '@core/enums';
import type { AuctionStatus } from '@features/auctions/enums';

export type ActivityTab = 'auctions' | 'bids';

export interface MyAuctionFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: AuctionStatus;
  category?: AuctionCategory;
  hasWinner?: boolean;
  sortBy?: 'createdAt' | 'endTime' | 'currentPrice' | 'startingPrice';
  sortOrder?: SortOrder;
}

export type MyBidStatusFilter = 'WINNING' | 'OUTBID' | 'WON' | 'LOST';

export interface MyBidFilters {
  page?: number;
  limit?: number;
  search?: string;
  bidStatus?: MyBidStatusFilter;
  auctionStatus?: AuctionStatus;
  category?: AuctionCategory;
  sortBy?: 'createdAt' | 'amount' | 'endTime' | 'currentPrice';
  sortOrder?: SortOrder;
}

export interface MyBidAuction {
  id: number;
  title: string;
  description: string;
  mainImageUrl: string;
  startingPrice: number;
  currentPrice: number;
  startTime: string;
  endTime: string;
  status: AuctionStatus;
  category: AuctionCategory;
  createdAt: string;
}

export interface MyBid {
  id: number;
  amount: number;
  auctionId: number;
  createdAt: string;
  auction?: MyBidAuction;
}
