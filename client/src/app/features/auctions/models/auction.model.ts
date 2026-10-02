import type { AuctionCategory, SortOrder } from '@core/enums';
import { AuctionSortBy, AuctionStatus } from '../enums';

export type { AuctionCategory } from '@core/enums';

export interface Auction {
  id: number;
  title: string;
  description: string;
  images: string[];
  mainImageUrl: string;
  startingPrice: number;
  currentPrice: number;
  bidCount: number;
  startTime: string;
  endTime: string;
  status: AuctionStatus;
  category: AuctionCategory;
  createdAt: string;
  owner?: {
    id: number;
    firstName?: string;
    lastName?: string;
    avatar?: string;
  };
}

export interface AuctionDetails extends Auction {
  images: string[];
  primaryImageIndex: number;
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

export interface CreateAuctionRequest {
  title: string;
  description: string;
  startingPrice: number;
  startTime?: string;
  endTime: string;
  imageUrls: string[];
  primaryImageIndex: number;
  category: AuctionCategory;
}

export interface UpdateAuctionRequest {
  title?: string;
  description?: string;
  appendDescription?: string;
  startingPrice?: number;
  startTime?: string;
  endTime?: string;
  category?: AuctionCategory;
}

export interface UploadedAuctionImage {
  url: string;
}

export interface AuctionListFilters {
  search?: string;
  category?: AuctionCategory;
  minPrice?: number;
  maxPrice?: number;
  sortBy: AuctionSortBy;
  sortOrder: SortOrder;
}

export interface AuctionImageSelection {
  file?: File;
  previewUrl: string;
}

export interface AuctionFormData {
  formValues: {
    title: string;
    description: string;
    appendDescription?: string;
    startingPrice: number | string;
    category: AuctionCategory;
    startImmediately: boolean;
    startTime: string;
    endTime: string;
  };
  images: AuctionImageSelection[];
  primaryImageIndex: number;
}
