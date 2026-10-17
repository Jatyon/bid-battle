import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { environment } from '@env/environment';
import { DEFAULT_PAGE_SIZE } from '@core/constants';
import { BidsService } from './bids.service';

describe('BidsService', () => {
  let service: BidsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(BidsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('gets user bids with pagination using default limit', () => {
    let result: unknown;
    service.getMyBids(1).subscribe((data) => (result = data));

    const request = httpMock.expectOne(`${environment.apiUrl}/bids/my?page=1&limit=${DEFAULT_PAGE_SIZE}`);
    expect(request.request.method).toBe('GET');
    const mockData = { items: [], page: 1, limit: DEFAULT_PAGE_SIZE, total: 0 };
    request.flush({ statusCode: 200, timestamp: new Date().toISOString(), data: mockData });

    expect(result).toEqual(mockData);
  });
});
