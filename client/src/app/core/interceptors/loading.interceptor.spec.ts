import { provideHttpClient, withInterceptors, HttpClient, HttpContext } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { LoadingService } from '@core/services';
import { loadingInterceptor } from './loading.interceptor';
import { SKIP_LOADING } from './http-context.tokens';
import { noop } from 'rxjs';

describe('loadingInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let loadingService: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    loadingService = { start: vi.fn(), stop: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([loadingInterceptor])),
        provideHttpClientTesting(),
        { provide: LoadingService, useValue: loadingService },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should call start() when request begins', () => {
    http.get('/api/data').subscribe();

    httpMock.expectOne('/api/data').flush({});

    expect(loadingService.start).toHaveBeenCalledTimes(1);
  });

  it('should call stop() after request completes successfully', () => {
    http.get('/api/data').subscribe();

    httpMock.expectOne('/api/data').flush({});

    expect(loadingService.stop).toHaveBeenCalledTimes(1);
  });

  it('should call stop() after request fails', () => {
    http.get('/api/data').subscribe({ error: noop });

    httpMock.expectOne('/api/data').flush('Server error', {
      status: 500,
      statusText: 'Internal Server Error',
    });

    expect(loadingService.stop).toHaveBeenCalledTimes(1);
  });

  it('should NOT call start() when SKIP_LOADING context is set', () => {
    const context = new HttpContext().set(SKIP_LOADING, true);

    http.get('/api/data', { context }).subscribe();

    httpMock.expectOne('/api/data').flush({});

    expect(loadingService.start).not.toHaveBeenCalled();
    expect(loadingService.stop).not.toHaveBeenCalled();
  });
});
