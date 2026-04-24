import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('@layouts/main-layout/main-layout').then((m) => m.MainLayout),
  },

  {
    path: 'auth',
    loadComponent: () => import('@layouts/auth-layout/auth-layout').then((m) => m.AuthLayout),
  },

  {
    path: '**',
    loadComponent: () => import('@layouts/error-layout/error-layout').then((m) => m.ErrorLayout),
  },
];
