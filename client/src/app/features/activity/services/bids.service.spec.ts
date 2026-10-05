import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { environment } from '@env/environment';
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

  it('gets user bids with pagination', () => {
    let result: unknown;
    service.getMyBids(1, 10).subscribe((data) => (result = data));

    const request = httpMock.expectOne(`${environment.apiUrl}/bids/my?page=1&limit=10`);
    expect(request.request.method).toBe('GET');
    const mockData = { items: [], page: 1, limit: 10, total: 0 };
    request.flush({ statusCode: 200, timestamp: new Date().toISOString(), data: mockData });

    expect(result).toEqual(mockData);
  });
});
