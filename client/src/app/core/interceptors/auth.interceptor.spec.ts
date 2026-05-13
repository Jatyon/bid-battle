import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withInterceptors, HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { TokenService } from '@core/services';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let tokenMock: { accessToken: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    tokenMock = { accessToken: vi.fn().mockReturnValue(null) };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: TokenService, useValue: tokenMock },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should attach Authorization header when access token is present', () => {
    tokenMock.accessToken.mockReturnValue('my-token');

    http.get('/api/test').subscribe();

    const req = httpMock.expectOne('/api/test');
    expect(req.request.headers.get('Authorization')).toBe('Bearer my-token');
    req.flush({});
  });

  it('should NOT attach Authorization header when there is no token', () => {
    tokenMock.accessToken.mockReturnValue(null);

    http.get('/api/test').subscribe();

    const req = httpMock.expectOne('/api/test');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('should pass the request through unchanged when no token', () => {
    tokenMock.accessToken.mockReturnValue(null);

    http.get('/api/test', { params: { page: '1' } }).subscribe();

    const req = httpMock.expectOne((r) => r.url === '/api/test');
    expect(req.request.params.get('page')).toBe('1');
    req.flush({});
  });
});
