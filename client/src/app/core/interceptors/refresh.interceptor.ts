import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import { environment } from '@env/environment';
import { AuthService, TokenService, AuthTokens } from '@core/index';
import { catchError, switchMap, throwError } from 'rxjs';

const REFRESH_URL = `${environment.apiUrl}/auth/refresh`;

/**
 * Intercepts 401 responses and attempts a silent token refresh.
 *
 * Flow:
 *  1. Request returns 401
 *  2. If a refresh is NOT already in progress → call POST /auth/refresh
 *     (the server reads the HttpOnly refresh-token cookie automatically)
 *  3. On success → store new accessToken in memory, retry original request
 *  4. If another 401 arrives during refresh → queue it, wait for the refresh to resolve
 *  5. If refresh fails → logout and propagate the error
 *
 */
export const refreshInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.url.includes('/auth/refresh')) return next(req);

  const http = inject(HttpClient);
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

      tokenService.startRefresh();

      return http.post<AuthTokens>(REFRESH_URL, {}, { withCredentials: true }).pipe(
        switchMap((authTokens) => {
          tokenService.resolveRefresh(authTokens.accessToken);
          authService.refreshAccessToken(authTokens.accessToken);

          const retried = req.clone({
            setHeaders: { Authorization: `Bearer ${authTokens.accessToken}` },
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
