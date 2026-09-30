import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { environment } from '@env/environment';
import { Auction, PaginatedResponse } from '../models/auction.model';
import { AuctionsService } from './auctions.service';

describe('AuctionsService', () => {
  let service: AuctionsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuctionsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('gets active auctions and forwards search filters, sorting, and pagination', () => {
    const response: PaginatedResponse<Auction> = { items: [], page: 2, limit: 10, total: 0 };
    let result: PaginatedResponse<Auction> | undefined;

    service
      .getActiveAuctions({
        page: 2,
        limit: 10,
        search: 'camera',
        category: 'electronics',
        minPrice: 1000,
        maxPrice: 50000,
        sortBy: 'endTime',
        sortOrder: 'ASC',
      })
      .subscribe((value) => (result = value));

    const request = httpMock.expectOne((req) => req.url === `${environment.apiUrl}/auctions`);
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('limit')).toBe('10');
    expect(request.request.params.get('search')).toBe('camera');
    expect(request.request.params.get('category')).toBe('electronics');
    expect(request.request.params.get('minPrice')).toBe('1000');
    expect(request.request.params.get('maxPrice')).toBe('50000');
    expect(request.request.params.get('sortBy')).toBe('endTime');
    expect(request.request.params.get('sortOrder')).toBe('ASC');
    request.flush({ statusCode: 200, timestamp: new Date().toISOString(), data: response });

    expect(result).toEqual(response);
  });

  it('omits optional query params when they are not provided', () => {
    service
      .getActiveAuctions({ page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'DESC' })
      .subscribe();

    const request = httpMock.expectOne((req) => req.url === `${environment.apiUrl}/auctions`);
    expect(request.request.params.keys()).toEqual(['page', 'limit', 'sortBy', 'sortOrder']);
    request.flush({
      statusCode: 200,
      timestamp: new Date().toISOString(),
      data: { items: [], page: 1, limit: 10, total: 0 },
    });
  });
});
