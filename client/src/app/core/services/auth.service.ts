import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { LoginForm, RegisterForm } from '@app/features/auth';
import { SKIP_REFRESH_CONTEXT } from '@core/interceptors/http-context.tokens';
import { User, AuthTokens } from '@core/models';
import { StorageService } from './storage.service';
import { TokenService } from './token.service';
import { ApiService } from './api.service';
import { Observable, map, noop, tap } from 'rxjs';

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

  login(credentials: LoginForm): Observable<void> {
    return this.api.post<{ accessToken: string; user: User }>('/auth/login', credentials).pipe(
      tap((response) => this.setSession(response.data.accessToken, response.data.user)),
      map(() => undefined),
    );
  }

  register(data: RegisterForm): Observable<void> {
    return this.api.post<{ accessToken: string; user: User }>('/auth/register', data).pipe(
      tap((response) => this.setSession(response.data.accessToken, response.data.user)),
      map(() => undefined),
    );
  }

  /**
   * [Krok 5 & 12] Przesyła authorization code (odebrany z okna popup Google)
   * do backendu. Backend wymienia go na tokeny, weryfikuje id_token i zwraca
   * własny JWT. ACCESS TOKEN trafia do pamięci; refresh token — w HttpOnly cookie.
   */
  loginWithOAuthCode(provider: 'google' | 'github', code: string): Observable<void> {
    return this.api
      .post<{ accessToken: string; user: User }>('/auth/oauth/code', { provider, code })
      .pipe(
        tap((response) => this.setSession(response.data.accessToken, response.data.user)),
        map(() => undefined),
      );
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
    return this.api.post<AuthTokens>('/auth/refresh', {}, SKIP_REFRESH_CONTEXT).pipe(
      map((response) => {
        this.refreshAccessToken(response.data.accessToken);
        return true;
      }),
    );
  }

  /**
   * Logs the user out — clears local state and invalidates the refresh-token
   * cookie on the server side by calling POST /auth/logout.
   *
   * The local session is always cleared immediately (optimistic logout),
   * regardless of whether the API call succeeds, so the user is never
   * stuck in a half-logged-in state due to a network error.
   *
   * @param redirect  When true (default) navigates to /auth/login after clearing state.
   */
  logout(redirect = true): void {
    this.tokenService.clearAccessToken();
    this.storage.remove(STORAGE_USER_KEY);
    this.state.set({ user: null });

    // Fire-and-forget — invalidates the HttpOnly refresh-token cookie server-side.
    // Errors are intentionally swallowed: the local session is already gone and
    // there is nothing the user or the app can do about a failed logout request.
    this.api.post('/auth/logout', {}).subscribe({
      error: noop,
    });

    if (redirect) this.router.navigate(['/auth/login']);
  }
}
