import { UrlTree, provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '@core/index';
import { guestGuard } from './guest.guard';

const runGuard = () => TestBed.runInInjectionContext(() => guestGuard({} as never, {} as never));

const setupAuthService = (isAuthenticated: boolean) => {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: AuthService,
        useValue: {
          isAuthenticated: vi.fn().mockReturnValue(isAuthenticated),
        },
      },
    ],
  });
};

describe('guestGuard', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('when user is NOT authenticated', () => {
    it('should return true — allow access to the guest route', () => {
      setupAuthService(false);

      const result = runGuard();

      expect(result).toBe(true);
    });
  });

  describe('when user IS authenticated', () => {
    it('should return a UrlTree redirecting to /', () => {
      setupAuthService(true);

      const result = runGuard();

      expect(result).toBeInstanceOf(UrlTree);
      expect((result as UrlTree).toString()).toBe('/');
    });
  });
});
