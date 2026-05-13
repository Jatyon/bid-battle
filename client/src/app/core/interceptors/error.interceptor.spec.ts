import { provideHttpClient, withInterceptors, HttpClient, HttpContext } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NotificationService, AuthService, TokenService } from '@core/index';
import { SKIP_ERROR_TOAST } from './http-context.tokens';
import { errorInterceptor } from './error.interceptor';
import { noop } from 'rxjs';

describe('errorInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let notificationService: { error: ReturnType<typeof vi.fn> };
  let authService: { logout: ReturnType<typeof vi.fn> };
  let tokenMock: { accessToken: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    notificationService = { error: vi.fn() };
    authService = { logout: vi.fn() };
    tokenMock = { accessToken: vi.fn().mockReturnValue(null) };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: NotificationService, useValue: notificationService },
        { provide: AuthService, useValue: authService },
        { provide: TokenService, useValue: tokenMock },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('error toast', () => {
    it('should show an error notification on HTTP error', () => {
      http.get('/api/data').subscribe({ error: noop });

      httpMock
        .expectOne('/api/data')
        .flush({ message: 'Something went wrong' }, { status: 500, statusText: 'Server Error' });

      expect(notificationService.error).toHaveBeenCalledWith('Something went wrong', false);
    });

    it('should use first item when error body.message is an array', () => {
      http.get('/api/data').subscribe({ error: noop });

      httpMock
        .expectOne('/api/data')
        .flush(
          { message: ['First error', 'Second error'] },
          { status: 400, statusText: 'Bad Request' },
        );

      expect(notificationService.error).toHaveBeenCalledWith('First error', false);
    });

    it('should fall back to error.message when body has no message', () => {
      http.get('/api/data').subscribe({ error: noop });

      const req = httpMock.expectOne('/api/data');
      req.flush(null, { status: 503, statusText: 'Service Unavailable' });

      expect(notificationService.error).toHaveBeenCalledWith(
        'Http failure response for /api/data: 503 Service Unavailable',
        false,
      );
    });

    it('should NOT show toast when SKIP_ERROR_TOAST context is set', () => {
      const context = new HttpContext().set(SKIP_ERROR_TOAST, true);

      http.get('/api/data', { context }).subscribe({ error: noop });

      httpMock
        .expectOne('/api/data')
        .flush({ message: 'Silent error' }, { status: 500, statusText: 'Server Error' });

      expect(notificationService.error).not.toHaveBeenCalled();
    });
  });

  describe('401 handling', () => {
    it('should call logout() when 401 and access token is present', () => {
      tokenMock.accessToken.mockReturnValue('valid-token');

      http.get('/api/secure').subscribe({ error: noop });

      httpMock
        .expectOne('/api/secure')
        .flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

      expect(authService.logout).toHaveBeenCalled();
    });

    it('should NOT call logout() when 401 but access token is already gone', () => {
      tokenMock.accessToken.mockReturnValue(null);

      http.get('/api/secure').subscribe({ error: noop });

      httpMock
        .expectOne('/api/secure')
        .flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

      expect(authService.logout).not.toHaveBeenCalled();
    });

    it('should NOT call logout() on non-401 errors', () => {
      tokenMock.accessToken.mockReturnValue('valid-token');

      http.get('/api/data').subscribe({ error: noop });

      httpMock
        .expectOne('/api/data')
        .flush({ message: 'Forbidden' }, { status: 403, statusText: 'Forbidden' });

      expect(authService.logout).not.toHaveBeenCalled();
    });
  });

  describe('error propagation', () => {
    it('should propagate the original error to the subscriber', () => {
      let capturedError: unknown;

      http.get('/api/data').subscribe({ error: (err) => (capturedError = err) });

      httpMock
        .expectOne('/api/data')
        .flush({ message: 'Not found' }, { status: 404, statusText: 'Not Found' });

      expect((capturedError as { status: number }).status).toBe(404);
    });
  });
});
