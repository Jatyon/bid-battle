import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { ApiService, AuthService, TokenService, AuthTokens } from '@core/index';
import {
  SKIP_ERROR_TOAST,
  SKIP_LOADING,
  SKIP_REFRESH_CONTEXT,
  SKIP_REFRESH_ON_401,
} from './http-context.tokens';
import { catchError, switchMap, throwError } from 'rxjs';

const REFRESH_CONTEXT = SKIP_REFRESH_CONTEXT.set(SKIP_LOADING, true).set(SKIP_ERROR_TOAST, true);

export const refreshInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.context.get(SKIP_REFRESH_ON_401)) return next(req);

  const api = inject(ApiService);
  const tokenService = inject(TokenService);
  const authService = inject(AuthService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status !== 401) return throwError(() => error);

      if (tokenService.isRefreshing) {
        return tokenService.waitForToken().pipe(
          switchMap((newToken) => {
            if (!newToken) return throwError(() => error);
            const retried = req.clone({ setHeaders: { Authorization: `Bearer ${newToken}` } });
            return next(retried);
          }),
        );
      }

      if (!authService.currentUser()) return throwError(() => error);

      tokenService.startRefresh();
      return api.post<AuthTokens>('/auth/refresh', {}, REFRESH_CONTEXT).pipe(
        switchMap((response) => {
          const { accessToken } = response.data;
          tokenService.resolveRefresh(accessToken);
          authService.refreshAccessToken(accessToken);

          const retried = req.clone({
            setHeaders: { Authorization: `Bearer ${accessToken}` },
          });
          return next(retried);
        }),
        catchError((refreshError) => {
          tokenService.rejectRefresh();
          authService.logout();
          return throwError(() => refreshError);
        }),
      );
    }),
  );
};
