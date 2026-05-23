import { Routes } from '@angular/router';

export const AUTH_ROUTES: Routes = [
  {
    path: 'login',
    title: 'ROUTES.LOGIN',
    loadComponent: () => import('@features/auth/pages/login/login').then((m) => m.LoginPage),
  },
  {
    path: 'register',
    title: 'ROUTES.REGISTER',
    loadComponent: () => import('@features/auth/pages/register/register').then((m) => m.RegisterPage),
  },
  {
    path: 'forgot-password',
    title: 'ROUTES.FORGOT_PASSWORD',
    loadComponent: () =>
      import('@features/auth/pages/forgot-password/forgot-password').then((m) => m.ForgotPasswordPage),
  },
  {
    path: 'reset-password',
    title: 'ROUTES.RESET_PASSWORD',
    loadComponent: () =>
      import('@features/auth/pages/reset-password/reset-password').then((m) => m.ResetPasswordPage),
  },
  {
    path: 'verify-email',
    title: 'ROUTES.VERIFY_EMAIL',
    loadComponent: () =>
      import('@features/auth/pages/verify-email/verify-email').then((m) => m.VerifyEmailPage),
  },
  {
    path: 'oauth-callback',
    title: 'ROUTES.OAUTH_CALLBACK',
    loadComponent: () =>
      import('@features/auth/pages/oauth-callback/oauth-callback').then((m) => m.OAuthCallbackPage),
  },
  { path: '**', redirectTo: 'login' },
];
