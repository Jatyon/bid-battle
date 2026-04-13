import { AppRoutes } from '@shared/layout/types/app-routes.type';

export const routes: AppRoutes = [
  {
    path: '',
    loadChildren: () =>
      import('@layouts/main-layout/main-layout.routes').then((c) => c.mainLayoutRoutes),
  },
  {
    path: 'auth',
    loadChildren: () =>
      import('@layouts/auth-layout/auth-layout.routes').then((c) => c.authLayoutRoutes),
  },
  {
    path: 'error',
    loadChildren: () =>
      import('@layouts/error-layout/error-layout.routes').then((c) => c.errorLayoutRoutes),
  },
  {
    path: '**',
    pathMatch: 'full',
    redirectTo: 'error',
  },
];
