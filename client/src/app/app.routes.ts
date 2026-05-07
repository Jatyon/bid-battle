import { Routes } from '@angular/router';
import { authGuard, guestGuard } from '@core/guards';

export const routes: Routes = [
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('@layouts/main-layout/main-layout').then((m) => m.MainLayout),
  },
  {
    path: 'profile',
    canActivate: [authGuard],
    loadComponent: () => import('@layouts/main-layout/main-layout').then((m) => m.MainLayout),
  },

  {
    path: 'auth',
    canActivate: [guestGuard],
    loadComponent: () => import('@layouts/auth-layout/auth-layout').then((m) => m.AuthLayout),
  },

  // authGuard runs first: unauthenticated users are redirected to /auth/login
  // (or trigger a silent refresh) before ever seeing the 404 page.
  // This prevents leaking application structure to users who are not logged in.
  {
    path: '**',
    canActivate: [authGuard],
    loadComponent: () => import('@layouts/error-layout/error-layout').then((m) => m.ErrorLayout),
  },
];
