import { Routes } from '@angular/router';

export const AUTH_ROUTES: Routes = [
  {
    path: 'login',
    title: 'ROUTES.LOGIN',
    loadComponent: () => import('@features/auth/pages/login/login').then((m) => m.LoginPage),
  },
  {
    path: 'oauth-callback',
    title: 'ROUTES.OAUTH_CALLBACK',
    loadComponent: () =>
      import('@features/auth/pages/oauth-callback/oauth-callback').then((m) => m.OAuthCallbackPage),
  },
  { path: '**', redirectTo: 'login' },
];
