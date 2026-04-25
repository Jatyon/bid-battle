import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { TokenService } from '@core/services';

/**
 * Attaches the Bearer token to every outgoing request when the user is authenticated.
 * The token is read from in-memory TokenService — never from localStorage.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(TokenService).accessToken();

  const cloned = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(cloned);
};
