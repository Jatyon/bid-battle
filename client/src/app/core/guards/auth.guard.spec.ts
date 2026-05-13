import { UrlTree, provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '@core/index';
import { authGuard } from './auth.guard';
import { firstValueFrom, Observable, of } from 'rxjs';

const runGuard = () => TestBed.runInInjectionContext(() => authGuard({} as never, {} as never));

const setupAuthService = (
  overrides: Partial<{
    isAuthenticated: boolean;
    currentUser: unknown;
    silentRefreshResult: boolean;
  }> = {},
) => {
  const { isAuthenticated = false, currentUser = null, silentRefreshResult = true } = overrides;
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: AuthService,
        useValue: {
          isAuthenticated: vi.fn().mockReturnValue(isAuthenticated),
          currentUser: vi.fn().mockReturnValue(currentUser),
          silentRefresh: vi.fn().mockReturnValue(of(silentRefreshResult)),
        },
      },
    ],
  });
};

describe('authGuard', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('when isAuthenticated() is true', () => {
    it('should return true immediately without calling silentRefresh', () => {
      setupAuthService({ isAuthenticated: true });

      const result = runGuard();

      expect(result).toBe(true);
      const authService = TestBed.inject(AuthService);
      expect(authService.silentRefresh).not.toHaveBeenCalled();
    });
  });

  describe('when isAuthenticated() is false but currentUser() is set', () => {
    it('should call silentRefresh', () => {
      setupAuthService({ isAuthenticated: false, currentUser: { id: 1 } });

      runGuard();

      const authService = TestBed.inject(AuthService);
      expect(authService.silentRefresh).toHaveBeenCalledOnce();
    });

    it('should return true when silentRefresh succeeds', async () => {
      setupAuthService({
        isAuthenticated: false,
        currentUser: { id: 1 },
        silentRefreshResult: true,
      });

      const result = await firstValueFrom(runGuard() as Observable<boolean | UrlTree>);

      expect(result).toBe(true);
    });

    it('should return a UrlTree to /auth/login when silentRefresh fails', async () => {
      setupAuthService({
        isAuthenticated: false,
        currentUser: { id: 1 },
        silentRefreshResult: false,
      });
      
      const result = await firstValueFrom(runGuard() as Observable<boolean | UrlTree>);

      expect(result).toBeInstanceOf(UrlTree);
      expect((result as UrlTree).toString()).toBe('/auth/login');
    });
  });

  describe('when isAuthenticated() is false and currentUser() is null', () => {
    it('should return a UrlTree to /auth/login without calling silentRefresh', () => {
      setupAuthService({ isAuthenticated: false, currentUser: null });

      const result = runGuard();

      expect(result).toBeInstanceOf(UrlTree);
      expect((result as UrlTree).toString()).toBe('/auth/login');

      const authService = TestBed.inject(AuthService);
      expect(authService.silentRefresh).not.toHaveBeenCalled();
    });
  });
});
