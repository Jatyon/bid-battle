import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { User } from '@core/models';
import { StorageService } from './storage.service';
import { TokenService } from './token.service';

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

  logout(redirect = true): void {
    this.tokenService.clearAccessToken();
    this.storage.remove(STORAGE_USER_KEY);
    this.state.set({ user: null });

    if (redirect) this.router.navigate(['/auth/login']);
  }
}
