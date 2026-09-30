import { Injectable, inject } from '@angular/core';
import { ApiService } from '@core/services/api.service';
import { Auction, AuctionSearchQuery, PaginatedResponse } from '../models/auction.model';
import { Observable, map } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuctionsService {
  private readonly api = inject(ApiService);

  getActiveAuctions(query: AuctionSearchQuery): Observable<PaginatedResponse<Auction>> {
    const params: Record<string, string | number> = {
      page: query.page,
      limit: query.limit,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    };
    if (query.search) params['search'] = query.search;
    if (query.category) params['category'] = query.category;
    if (query.minPrice !== undefined) params['minPrice'] = query.minPrice;
    if (query.maxPrice !== undefined) params['maxPrice'] = query.maxPrice;

    return this.api
      .get<PaginatedResponse<Auction>>('/auctions', params)
      .pipe(map((response) => response.data));
  }
}
