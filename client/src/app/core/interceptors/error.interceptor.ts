import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { NotificationService, AuthService } from '@core/index';
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
 * Also logs out the user if a 401 Unauthorized error is encountered.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const notificationService = inject(NotificationService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      const message = resolveMessage(error);

      if (req.url.includes('/auth/refresh')) return throwError(() => error);

      if (error.status === HTTP_STATUS.UNAUTHORIZED) authService.logout();

      notificationService.error(message, false);

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
