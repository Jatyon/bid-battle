import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '@core/index';

/**
 * Prevents authenticated users from accessing guest-only pages (e.g. login, register).
 * Authenticated users are redirected to the home page.
 */
export const guestGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) return true;

  return router.createUrlTree(['/']);
};
