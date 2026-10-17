import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService, NotificationService } from '@core/index';
import { AuctionsService } from '../services/auctions.service';
import { catchError, map, of } from 'rxjs';

/**
 * Protects the auction edit route (/edit/:id).
 *
 * Ensures that:
 * 1. An auction ID is present in route params and is a valid number.
 * 2. An authenticated user exists.
 * 3. The authenticated user is the owner of the auction (`auction.owner?.id === currentUser.id`).
 *
 * If any of these checks fail (not owner, auction not found, invalid ID), the user
 * is redirected to the home page ('/') with an error notification.
 */
export const auctionOwnerGuard: CanActivateFn = (route) => {
  const auctionsService = inject(AuctionsService);
  const authService = inject(AuthService);
  const router = inject(Router);
  const notifications = inject(NotificationService);

  const rawId = route.paramMap.get('id');
  const numId = Number(rawId);
  if (!numId || isNaN(numId)) return router.createUrlTree(['/']);

  const currentUser = authService.currentUser();

  if (!currentUser) return router.createUrlTree(['/auth/login'], { queryParams: { returnUrl: router.url } });

  return auctionsService.getAuctionById(numId).pipe(
    map((auction) => {
      if (auction.owner?.id !== currentUser.id) {
        notifications.error('AUCTIONS.EDIT.ERROR_NOT_OWNER');
        return router.createUrlTree(['/']);
      }

      route.data = { ...route.data, initialAuction: auction };
      return true;
    }),
    catchError(() => {
      notifications.error('AUCTIONS.EDIT.ERROR_LOAD');
      return of(router.createUrlTree(['/']));
    }),
  );
};
