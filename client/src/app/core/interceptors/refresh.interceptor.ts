import { HttpContext, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { ApiService, AuthService, TokenService, AuthTokens } from '@core/index';
import { SKIP_ERROR_TOAST, SKIP_LOADING, SKIP_REFRESH_ON_401 } from './http-context.tokens';
import { catchError, switchMap, throwError } from 'rxjs';

/**
 * Context applied to the refresh token request itself:
 *  – SKIP_REFRESH_ON_401: breaks the potential infinite refresh loop
 *  – SKIP_LOADING: silent refresh must not trigger the global loading spinner
 *  – SKIP_ERROR_TOAST: the caller (logout + redirect) handles the failure UX
 */
const REFRESH_CONTEXT = new HttpContext()
  .set(SKIP_REFRESH_ON_401, true)
  .set(SKIP_LOADING, true)
  .set(SKIP_ERROR_TOAST, true);

/**
 * Intercepts 401 responses and attempts a silent token refresh.
 *
 * Flow:
 *  1. Request returns 401
 *  2. If this request has SKIP_REFRESH_ON_401 → bail out (prevents refresh loops).
 *  3. If there is no known user session (currentUser is null) → bail out immediately.
 *     This prevents looping refresh attempts after a logout or a failed refresh, even
 *     when in-flight requests keep returning 401 after the session has been invalidated.
 *  4. If a refresh is NOT already in progress → call POST /auth/refresh via ApiService
 *     (the server reads the HttpOnly refresh-token cookie automatically)
 *  5. On success → store new accessToken in memory, retry original request
 *  6. If another 401 arrives during refresh → queue it, wait for the refresh to resolve
 *  7. If refresh fails → logout and propagate the error
 *
 * Note: ApiService is used here (not raw HttpClient) for consistency. The REFRESH_CONTEXT
 * above ensures this request is excluded from the loading, error-toast and refresh interceptors
 * themselves, so there is no interceptor loop.
 */
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

      // No known user session means either:
      //  a) the user was never logged in,
      //  b) logout() was already called (e.g. by a concurrent failed refresh).
      // In both cases there is nothing to refresh — bail out immediately to
      // prevent a refresh-loop where every in-flight 401 restarts the cycle.
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
