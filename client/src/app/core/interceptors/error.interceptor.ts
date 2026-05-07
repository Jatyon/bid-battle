import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { NotificationService, AuthService, TokenService } from '@core/index';
import { SKIP_ERROR_TOAST } from './http-context.tokens';
import { catchError, throwError } from 'rxjs';

const HTTP_STATUS = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  SERVER_ERROR: 500,
} as const;

/**
 * Global HTTP error interceptor.
 * Handles errors from all HTTP requests and shows appropriate notifications.
 * Requests with `SKIP_ERROR_TOAST` context token set to `true` skip the toast.
 *
 * 401 handling:
 *  – If the user still has an in-memory access token, it means the refresh also
 *    failed and nobody has logged them out yet → we do it here.
 *  – If the token is already gone (refreshInterceptor already called logout),
 *    we skip the second logout to avoid a double redirect / double state reset.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const tokenService = inject(TokenService);
  const notificationService = inject(NotificationService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === HTTP_STATUS.UNAUTHORIZED && tokenService.accessToken())
        authService.logout();

      if (!req.context.get(SKIP_ERROR_TOAST))
        notificationService.error(resolveMessage(error), false);

      return throwError(() => error);
    }),
  );
};

function resolveMessage(error: HttpErrorResponse): string {
  const body = error.error as { message?: string | string[] } | null;

  if (!body) return error.message;

  if (Array.isArray(body.message)) return body.message[0];

  return body.message ?? error.message;
}
