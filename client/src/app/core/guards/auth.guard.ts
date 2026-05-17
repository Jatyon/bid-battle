import { CanActivateFn, Router } from '@angular/router';
import { PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { AuthService, TokenService } from '@core/index';
import { catchError, map, throwError } from 'rxjs';

/**
 * Protects routes that require an authenticated user.
 *
 * Three-state logic to handle the page-reload scenario where the in-memory
 * access token has been lost but the user record is still in localStorage:
 *
 *  1. `isAuthenticated()` is true  → access token is in memory → allow immediately.
 *  2. `currentUser()` is set but no token → page was reloaded; attempt a silent
 *     refresh using the HttpOnly refresh-token cookie. Allow on success, redirect
 *     to /auth/login on failure (expired / missing cookie).
 *  3. Neither token nor user → user was never logged in → redirect to /auth/login.
 */
export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const tokenService = inject(TokenService);
  const platformId = inject(PLATFORM_ID);
  const router = inject(Router);

  if (!isPlatformBrowser(platformId)) return true;

  if (authService.isAuthenticated()) return true;

  if (!authService.currentUser()) return router.createUrlTree(['/auth/login']);

  return authService.silentRefresh().pipe(
    map((success) => (success ? true : router.createUrlTree(['/auth/login']))),
    catchError((refreshError) => {
      tokenService.rejectRefresh();
      authService.logout();
      return throwError(() => refreshError);
    }),
  );
};
