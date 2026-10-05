import { Injectable, inject } from '@angular/core';
import type { PaginatedResponse } from '@core/models/paginated-response.model';
import { cleanParams, normalizePageParams } from '@core/utils';
import { ApiService } from '@core/services/api.service';
import {
  Auction,
  AuctionSearchQuery,
  CreateAuctionRequest,
  UploadedAuctionImage,
  AuctionDetails,
  UpdateAuctionRequest,
  MyAuction,
} from '@features/auctions';
import type { MyAuctionFilters } from '@features/activity/models';
import { Observable, map } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuctionsService {
  private readonly api = inject(ApiService);

  getActiveAuctions(query: AuctionSearchQuery): Observable<PaginatedResponse<Auction>> {
    return this.api
      .get<PaginatedResponse<Auction>>(
        '/auctions',
        cleanParams(query as unknown as Record<string, unknown>),
      )
      .pipe(map((response) => response.data));
  }

  uploadAuctionImages(files: File[]): Observable<UploadedAuctionImage[]> {
    const formData = new FormData();
    files.forEach((file) => formData.append('images', file));

    return this.api
      .post<UploadedAuctionImage[]>('/auctions/upload-images', formData)
      .pipe(map((response) => response.data));
  }

  createAuction(request: CreateAuctionRequest): Observable<Auction> {
    return this.api.post<Auction>('/auctions', request).pipe(map((response) => response.data));
  }

  getAuctionById(id: number): Observable<AuctionDetails> {
    return this.api.get<AuctionDetails>(`/auctions/${id}`).pipe(map((response) => response.data));
  }

  updateAuction(id: number, request: UpdateAuctionRequest): Observable<AuctionDetails> {
    return this.api
      .patch<AuctionDetails>(`/auctions/${id}`, request)
      .pipe(map((response) => response.data));
  }

  updateAuctionImages(
    id: number,
    files: File[],
    existingImageUrls: string[],
    primaryImageIndex: number,
  ): Observable<{ message: string }> {
    const formData = new FormData();
    files.forEach((file) => formData.append('images', file));
    existingImageUrls.forEach((url) => formData.append('existingImageUrls[]', url));
    formData.append('primaryImageIndex', primaryImageIndex.toString());

    return this.api
      .patch<{ message: string }>(`/auctions/${id}/images`, formData)
      .pipe(map((response) => response.data));
  }

  getMyAuctions(params?: MyAuctionFilters | number, limit = 10): Observable<PaginatedResponse<MyAuction>> {
    return this.api
      .get<PaginatedResponse<MyAuction>>(
        '/auctions/my/auctions',
        cleanParams(normalizePageParams(params, limit)),
      )
      .pipe(map((response) => response.data));
  }

  cancelAuction(id: number): Observable<Auction> {
    return this.api
      .delete<Auction>(`/auctions/${id}`)
      .pipe(map((response) => response.data));
  }
}
