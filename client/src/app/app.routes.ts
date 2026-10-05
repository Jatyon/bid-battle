import { Routes } from '@angular/router';
import { authGuard, guestGuard } from '@core/guards';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('@layouts/main-layout/main-layout').then((m) => m.MainLayout),
    children: [
      {
        path: '',
        title: 'ROUTES.HOME',
        loadComponent: () =>
          import('@features/auctions/pages/auction-list/auction-list').then(
            (m) => m.AuctionListPage,
          ),
      },
      {
        path: 'sell',
        canActivate: [authGuard],
        title: 'ROUTES.SELL',
        loadComponent: () =>
          import('@features/auctions/pages/auction-create/auction-create').then(
            (m) => m.AuctionCreatePage,
          ),
      },
      {
        path: 'profile',
        canActivate: [authGuard],
        title: 'ROUTES.PROFILE',
        loadComponent: () => import('@features/profile').then((m) => m.ProfilePage),
      },
      {
        path: 'edit/:id',
        canActivate: [authGuard],
        title: 'ROUTES.EDIT',
        loadComponent: () =>
          import('@features/auctions/pages/auction-edit/auction-edit').then(
            (m) => m.AuctionEditPage,
          ),
      },
      {
        path: 'activity',
        canActivate: [authGuard],
        title: 'ROUTES.ACTIVITY',
        loadComponent: () =>
          import('@features/activity/pages/activity/activity').then((m) => m.ActivityPage),
      },
    ],
  },

  {
    path: 'auth',
    canActivate: [guestGuard],
    loadComponent: () => import('@layouts/auth-layout/auth-layout').then((m) => m.AuthLayout),
    loadChildren: () => import('@features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },

  {
    path: '**',
    loadComponent: () => import('@layouts/error-layout/error-layout').then((m) => m.ErrorLayout),
  },
];
