import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '@core/index';
import { map } from 'rxjs';

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
  const router = inject(Router);

  if (authService.isAuthenticated()) return true;

  if (!authService.currentUser()) return router.createUrlTree(['/auth/login']);

  return authService
    .silentRefresh()
    .pipe(map((success) => (success ? true : router.createUrlTree(['/auth/login']))));
};
