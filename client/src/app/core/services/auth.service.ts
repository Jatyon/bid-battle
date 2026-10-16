import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, Router } from '@angular/router';
import {
  User,
  AuthTokens,
  LoginRequest,
  RegisterRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  VerifyEmailRequest,
  ResendVerificationRequest,
  ChangePasswordRequest,
} from '@core/models';
import { SKIP_REFRESH_CONTEXT } from '@core/interceptors/http-context.tokens';
import { SocketService } from './socket/socket.service';
import { StorageService } from './storage.service';
import { TokenService } from './token.service';
import { ApiService } from './api.service';
import { Observable, catchError, map, noop, tap, throwError } from 'rxjs';

interface AuthState {
  user: User | null;
}

const STORAGE_USER_KEY = 'auth-user';

/**
 * Global authentication service.
 *
 * Token strategy:
 *  – accessToken  → in-memory only (TokenService signal), never persisted
 *  – refreshToken → HttpOnly cookie managed entirely by the server
 *
 * User info is kept in localStorage so the UI can display the profile
 * before the first refresh call resolves.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly storage = inject(StorageService);
  private readonly tokenService = inject(TokenService);
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly socketService = inject(SocketService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly state = signal<AuthState>({
    user: this.storage.getJson<User>(STORAGE_USER_KEY),
  });

  readonly currentUser = computed(() => this.state().user);

  /**
   * True when we have an in-memory access token.
   * Will be false after a page reload until the silent-refresh completes.
   */
  readonly isAuthenticated = computed(() => !!this.tokenService.accessToken());

  /**
   * Called after a successful login or token refresh response.
   * Stores the access token in memory and persists user info.
   */
  setSession(accessToken: string, user: User): void {
    this.tokenService.setAccessToken(accessToken);
    this.storage.setJson(STORAGE_USER_KEY, user);
    this.state.update((s) => ({ ...s, user }));
    this.socketService.reconnectAll();
  }

  /**
   * Called after a silent refresh — only the token changes, not the user.
   */
  refreshAccessToken(accessToken: string): void {
    this.tokenService.setAccessToken(accessToken);
  }

  updateUser(user: User): void {
    this.storage.setJson(STORAGE_USER_KEY, user);
    this.state.update((s) => ({ ...s, user }));
  }

  login(credentials: LoginRequest): Observable<void> {
    return this.api.post<{ accessToken: string; user: User }>('/auth/login', credentials).pipe(
      tap((response) => this.setSession(response.data.accessToken, response.data.user)),
      map(() => undefined),
    );
  }

  register(request: RegisterRequest): Observable<void> {
    return this.api.post<{ message: string }>('/auth/register', request).pipe(map(() => undefined));
  }

  forgotPassword(request: ForgotPasswordRequest): Observable<void> {
    return this.api
      .post<{ message: string }>('/auth/forgot-password', request)
      .pipe(map(() => undefined));
  }

  resetPassword(request: ResetPasswordRequest): Observable<void> {
    return this.api
      .post<{ message: string }>('/auth/reset-password', request)
      .pipe(map(() => undefined));
  }

  verifyEmail(request: VerifyEmailRequest): Observable<void> {
    return this.api
      .post<{ message: string }>('/auth/verify-email', request)
      .pipe(map(() => undefined));
  }

  resendVerificationEmail(request: ResendVerificationRequest): Observable<void> {
    return this.api
      .post<{ message: string }>('/auth/resend-verification', request)
      .pipe(map(() => undefined));
  }

  changePassword(request: ChangePasswordRequest): Observable<void> {
    return this.api
      .post<{ message: string }>('/auth/change-password', request)
      .pipe(map(() => undefined));
  }

  /**
   * Attempts a silent token refresh using the HttpOnly refresh-token cookie.
   * Returns `true` when a new access token is obtained, `false` otherwise.
   *
   * Used by `authGuard` to recover a valid session after a page reload,
   * when `currentUser()` is populated from localStorage but the in-memory
   * `accessToken` has been lost.
   */
  silentRefresh(): Observable<boolean> {
    if (this.tokenService.isRefreshing?.())
      return this.tokenService.waitForToken().pipe(map((token) => !!token));

    this.tokenService.startRefresh?.();

    return this.api.post<AuthTokens>('/auth/refresh', {}, SKIP_REFRESH_CONTEXT).pipe(
      map((response) => {
        const { accessToken } = response.data;
        this.tokenService.resolveRefresh?.(accessToken);
        this.refreshAccessToken(accessToken);
        return true;
      }),
      catchError((error) => {
        this.tokenService.rejectRefresh?.();
        return throwError(() => error);
      }),
    );
  }

  /**
   * Checks whether the currently active route hierarchy requires authentication.
   * Traverses the active route snapshot hierarchy looking for:
   *  - `data.requiresAuth: true`
   *  - route configurations with `canActivate` containing `authGuard`
   */
  isCurrentRouteProtected(): boolean {
    return this.isRouteProtected(this.router.routerState.snapshot?.root);
  }

  private isRouteProtected(route?: ActivatedRouteSnapshot | null): boolean {
    if (!route) return false;
    if (route.data?.['requiresAuth']) return true;
    if (
      route.routeConfig?.canActivate?.some(
        (guard) => typeof guard === 'function' && guard.name === 'authGuard',
      )
    ) {
      return true;
    }
    return route.children.some((child) => this.isRouteProtected(child));
  }

  /**
   * Logs the user out — clears local state and invalidates the refresh-token
   * cookie on the server side by calling POST /auth/logout.
   *
   * The local session is always cleared immediately (optimistic logout),
   * regardless of whether the API call succeeds, so the user is never
   * stuck in a half-logged-in state due to a network error.
   *
   * When `redirect` is true (default):
   *  - If the user is on a protected route (e.g. /profile, /sell, /activity),
   *    they are redirected to /auth/login.
   *  - If the user is on a public route (e.g. /auctions/:id, /), they remain
   *    on the current page as a guest.
   *
   * @param redirect  When true (default) navigates to /auth/login if current route is protected.
   */
  logout(redirect = true): void {
    this.tokenService.clearAccessToken();
    this.storage.remove(STORAGE_USER_KEY);
    this.state.set({ user: null });

    // Fire-and-forget — invalidates the HttpOnly refresh-token cookie server-side.
    // Errors are intentionally swallowed: the local session is already gone and
    // there is nothing the user or the app can do about a failed logout request.
    this.api.post('/auth/logout', {}).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      error: noop,
    });

    const isProtected = this.isCurrentRouteProtected();

    if (isProtected) {
      this.socketService.disconnectSockets();
      if (redirect) {
        void this.router.navigate(['/auth/login']);
      }
    } else {
      this.socketService.reconnectAll();
    }
  }
}
