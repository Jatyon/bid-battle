import { provideHttpClient, withInterceptors, HttpClient, HttpContext } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApiService, AuthService, TokenService, User } from '@core/index';
import { createUserFixture } from '@test/fixtures';
import { SKIP_REFRESH_ON_401 } from './http-context.tokens';
import { refreshInterceptor } from './refresh.interceptor';
import { noop, of, throwError } from 'rxjs';

const MOCK_USER: User = createUserFixture();

describe('refreshInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let tokenService: {
    accessToken: ReturnType<typeof vi.fn>;
    isRefreshing: boolean;
    startRefresh: ReturnType<typeof vi.fn>;
    resolveRefresh: ReturnType<typeof vi.fn>;
    rejectRefresh: ReturnType<typeof vi.fn>;
    waitForToken: ReturnType<typeof vi.fn>;
  };
  let authService: {
    currentUser: ReturnType<typeof vi.fn>;
    refreshAccessToken: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
  };
  let apiService: { post: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    tokenService = {
      accessToken: vi.fn().mockReturnValue(null),
      isRefreshing: false,
      startRefresh: vi.fn(),
      resolveRefresh: vi.fn(),
      rejectRefresh: vi.fn(),
      waitForToken: vi.fn(),
    };
    authService = {
      currentUser: vi.fn().mockReturnValue(MOCK_USER),
      refreshAccessToken: vi.fn(),
      logout: vi.fn(),
    };
    apiService = {
      post: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([refreshInterceptor])),
        provideHttpClientTesting(),
        { provide: TokenService, useValue: tokenService },
        { provide: AuthService, useValue: authService },
        { provide: ApiService, useValue: apiService },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('SKIP_REFRESH_ON_401 context', () => {
    it('should pass through without intercepting when SKIP_REFRESH_ON_401 is set', () => {
      const context = new HttpContext().set(SKIP_REFRESH_ON_401, true);

      http.get('/api/refresh', { context }).subscribe({ error: noop });

      httpMock
        .expectOne('/api/refresh')
        .flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

      expect(tokenService.startRefresh).not.toHaveBeenCalled();
      expect(apiService.post).not.toHaveBeenCalled();
    });
  });

  describe('non-401 errors', () => {
    it('should propagate non-401 errors without attempting a refresh', () => {
      let capturedStatus: number | undefined;

      http.get('/api/data').subscribe({ error: (err) => (capturedStatus = err.status) });

      httpMock
        .expectOne('/api/data')
        .flush({ message: 'Server error' }, { status: 500, statusText: 'Server Error' });

      expect(capturedStatus).toBe(500);
      expect(tokenService.startRefresh).not.toHaveBeenCalled();
    });
  });

  describe('successful refresh flow', () => {
    it('should start refresh, retry original request with new token and resolve', () => {
      apiService.post.mockReturnValue(of({ data: { accessToken: 'new-token' } }));

      let response: unknown;
      http.get('/api/data').subscribe((res) => (response = res));

      // First attempt → 401
      httpMock
        .expectOne('/api/data')
        .flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

      // Retried request with new token
      const retried = httpMock.expectOne('/api/data');
      expect(retried.request.headers.get('Authorization')).toBe('Bearer new-token');
      retried.flush({ success: true });

      expect(tokenService.startRefresh).toHaveBeenCalled();
      expect(tokenService.resolveRefresh).toHaveBeenCalledWith('new-token');
      expect(authService.refreshAccessToken).toHaveBeenCalledWith('new-token');
      expect(response).toEqual({ success: true });
    });
  });

  describe('no current user session', () => {
    it('should bail out immediately when currentUser is null on 401', () => {
      authService.currentUser.mockReturnValue(null);

      let capturedStatus: number | undefined;
      http.get('/api/data').subscribe({ error: (err) => (capturedStatus = err.status) });

      httpMock
        .expectOne('/api/data')
        .flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

      expect(capturedStatus).toBe(401);
      expect(tokenService.startRefresh).not.toHaveBeenCalled();
      expect(apiService.post).not.toHaveBeenCalled();
    });
  });

  describe('refresh failure', () => {
    it('should rejectRefresh and call logout when refresh request fails', () => {
      apiService.post.mockReturnValue(throwError(() => new Error('Refresh failed')));

      http.get('/api/data').subscribe({ error: noop });

      httpMock
        .expectOne('/api/data')
        .flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

      expect(tokenService.rejectRefresh).toHaveBeenCalled();
      expect(authService.logout).toHaveBeenCalled();
    });
  });

  describe('queuing during refresh', () => {
    it('should retry with new token when refresh is already in progress and succeeds', () => {
      tokenService.isRefreshing = true;
      tokenService.waitForToken.mockReturnValue(of('queued-token'));

      let response: unknown;
      http.get('/api/data').subscribe((res) => (response = res));

      httpMock
        .expectOne('/api/data')
        .flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

      const retried = httpMock.expectOne('/api/data');
      expect(retried.request.headers.get('Authorization')).toBe('Bearer queued-token');
      retried.flush({ queued: true });

      expect(response).toEqual({ queued: true });
    });

    it('should propagate error when waitForToken emits null (refresh rejected)', () => {
      tokenService.isRefreshing = true;
      tokenService.waitForToken.mockReturnValue(of(null));

      let capturedStatus: number | undefined;
      http.get('/api/data').subscribe({ error: (err) => (capturedStatus = err.status) });

      httpMock
        .expectOne('/api/data')
        .flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

      expect(capturedStatus).toBe(401);
    });
  });
});
