import { provideRouter, Router } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { User } from '@core/models';
import { createUserFixture } from '@test/fixtures';
import { StorageService } from './storage.service';
import { TokenService } from './token.service';
import { AuthService } from './auth.service';
import { ApiService } from './api.service';
import { SKIP_REFRESH_CONTEXT } from '@core/interceptors/http-context.tokens';
import { firstValueFrom, of, throwError } from 'rxjs';

const mockUser: User = createUserFixture();

describe('AuthService', () => {
  let service: AuthService;
  let storageMock: {
    getJson: ReturnType<typeof vi.fn>;
    setJson: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };
  let tokenMock: {
    accessToken: ReturnType<typeof vi.fn>;
    setAccessToken: ReturnType<typeof vi.fn>;
    clearAccessToken: ReturnType<typeof vi.fn>;
  };
  let apiMock: { post: ReturnType<typeof vi.fn> };
  let router: Router;

  beforeEach(() => {
    storageMock = {
      getJson: vi.fn().mockReturnValue(null),
      setJson: vi.fn(),
      remove: vi.fn(),
    };

    tokenMock = {
      accessToken: vi.fn().mockReturnValue(null),
      setAccessToken: vi.fn(),
      clearAccessToken: vi.fn(),
    };

    apiMock = {
      post: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: StorageService, useValue: storageMock },
        { provide: TokenService, useValue: tokenMock },
        { provide: ApiService, useValue: apiMock },
      ],
    });

    service = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('currentUser', () => {
    it('should load user from storage on init', () => {
      const storageMockWithUser = {
        getJson: vi.fn().mockReturnValue(mockUser),
        setJson: vi.fn(),
        remove: vi.fn(),
      };
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideRouter([]),
          { provide: StorageService, useValue: storageMockWithUser },
          { provide: TokenService, useValue: tokenMock },
          { provide: ApiService, useValue: apiMock },
        ],
      });
      const freshService = TestBed.inject(AuthService);
      expect(freshService.currentUser()).toEqual(mockUser);
    });

    it('should be null when storage is empty', () => {
      expect(service.currentUser()).toBeNull();
    });
  });

  describe('isAuthenticated', () => {
    it('should return false when there is no access token', () => {
      tokenMock.accessToken.mockReturnValue(null);
      expect(service.isAuthenticated()).toBe(false);
    });

    it('should return true when there is an access token', () => {
      tokenMock.accessToken.mockReturnValue('some-token');
      expect(service.isAuthenticated()).toBe(true);
    });
  });

  describe('setSession()', () => {
    it('should store the access token and persist user', () => {
      service.setSession('access-token', mockUser);

      expect(tokenMock.setAccessToken).toHaveBeenCalledWith('access-token');
      expect(storageMock.setJson).toHaveBeenCalledWith('auth-user', mockUser);
      expect(service.currentUser()).toEqual(mockUser);
    });
  });

  describe('refreshAccessToken()', () => {
    it('should update the access token without changing user', () => {
      service.setSession('old-token', mockUser);
      service.refreshAccessToken('new-token');

      expect(tokenMock.setAccessToken).toHaveBeenCalledWith('new-token');
    });
  });

  describe('updateUser()', () => {
    it('should update user in storage and state', () => {
      const updatedUser: User = { ...mockUser, firstName: 'Piotr' };
      service.updateUser(updatedUser);

      expect(storageMock.setJson).toHaveBeenCalledWith('auth-user', updatedUser);
      expect(service.currentUser()).toEqual(updatedUser);
    });
  });

  describe('silentRefresh()', () => {
    it('should return true and update token on success', async () => {
      apiMock.post.mockReturnValue(
        of({ data: { accessToken: 'refreshed-token', refreshToken: '' } } as never),
      );

      const result = await firstValueFrom(service.silentRefresh());

      expect(result).toBe(true);
      expect(tokenMock.setAccessToken).toHaveBeenCalledWith('refreshed-token');
    });

    it('should call /auth/refresh with SKIP_REFRESH_CONTEXT', async () => {
      apiMock.post.mockReturnValue(
        of({ data: { accessToken: 'refreshed-token', refreshToken: '' } } as never),
      );

      await firstValueFrom(service.silentRefresh());

      expect(apiMock.post).toHaveBeenCalledWith('/auth/refresh', {}, SKIP_REFRESH_CONTEXT);
    });

    it('should return false and logout on error', async () => {
      apiMock.post
        .mockReturnValueOnce(throwError(() => new Error('Network error')))
        .mockReturnValue(of(null as never));

      const result = await firstValueFrom(service.silentRefresh());

      expect(result).toBe(false);
      expect(tokenMock.clearAccessToken).toHaveBeenCalled();
      expect(storageMock.remove).toHaveBeenCalledWith('auth-user');
    });
  });

  describe('logout()', () => {
    it('should clear local session state', () => {
      apiMock.post.mockReturnValue(of(null as never));

      service.logout(false);

      expect(tokenMock.clearAccessToken).toHaveBeenCalled();
      expect(storageMock.remove).toHaveBeenCalledWith('auth-user');
      expect(service.currentUser()).toBeNull();
    });

    it('should call POST /auth/logout', () => {
      apiMock.post.mockReturnValue(of(null as never));
      service.logout(false);
      expect(apiMock.post).toHaveBeenCalledWith('/auth/logout', {});
    });

    it('should redirect to /auth/login by default', async () => {
      apiMock.post.mockReturnValue(of(null as never));
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      service.logout();
      await Promise.resolve();

      expect(navigateSpy).toHaveBeenCalledWith(['/auth/login']);
    });

    it('should not redirect when redirect=false', () => {
      apiMock.post.mockReturnValue(of(null as never));
      const navigateSpy = vi.spyOn(router, 'navigate');

      service.logout(false);

      expect(navigateSpy).not.toHaveBeenCalled();
    });
  });
});
