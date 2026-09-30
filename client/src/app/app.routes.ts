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
        loadComponent: () => import('@features/auctions').then((m) => m.AuctionListPage),
      },
      {
        path: 'profile',
        canActivate: [authGuard],
        title: 'ROUTES.PROFILE',
        loadComponent: () => import('@features/profile').then((m) => m.ProfilePage),
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
