import { Injectable, inject } from '@angular/core';
import type { PaginatedResponse } from '@core/models/paginated-response.model';
import { cleanParams, normalizePageParams } from '@core/utils';
import { DEFAULT_PAGE_SIZE } from '@core/constants';
import { ApiService } from '@core/services';
import type { MyBid, MyBidFilters } from '@features/activity/models';
import { Observable, map } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class BidsService {
  private readonly api = inject(ApiService);

  getMyBids(params?: MyBidFilters | number, limit = DEFAULT_PAGE_SIZE): Observable<PaginatedResponse<MyBid>> {
    return this.api
      .get<PaginatedResponse<MyBid>>('/bids/my', cleanParams(normalizePageParams(params, limit)))
      .pipe(map((response) => response.data));
  }
}

