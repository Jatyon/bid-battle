import { Routes } from '@angular/router';
import { authGuard, guestGuard } from '@core/guards';
import { auctionOwnerGuard } from '@features/auctions';

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
        path: 'auctions/:id',
        title: 'ROUTES.AUCTION_DETAILS',
        loadComponent: () =>
          import('@features/auctions/pages/auction-detail/auction-detail').then(
            (m) => m.AuctionDetailPage,
          ),
      },
      {
        path: 'users',
        title: 'ROUTES.USERS',
        loadComponent: () => import('@features/profile').then((m) => m.UsersSearchPage),
      },
      {
        path: 'users/:id',
        title: 'ROUTES.USER_PROFILE',
        loadComponent: () => import('@features/profile').then((m) => m.PublicProfilePage),
      },
      {
        path: 'sell',
        canActivate: [authGuard],
        data: { requiresAuth: true },
        title: 'ROUTES.SELL',
        loadComponent: () =>
          import('@features/auctions/pages/auction-create/auction-create').then(
            (m) => m.AuctionCreatePage,
          ),
      },
      {
        path: 'profile',
        canActivate: [authGuard],
        data: { requiresAuth: true },
        title: 'ROUTES.PROFILE',
        loadComponent: () => import('@features/profile').then((m) => m.ProfilePage),
      },
      {
        path: 'edit/:id',
        canActivate: [authGuard, auctionOwnerGuard],
        data: { requiresAuth: true },
        title: 'ROUTES.EDIT',
        loadComponent: () =>
          import('@features/auctions/pages/auction-edit/auction-edit').then(
            (m) => m.AuctionEditPage,
          ),
      },
      {
        path: 'activity',
        canActivate: [authGuard],
        data: { requiresAuth: true },
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
