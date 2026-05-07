import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { LoadingService } from '@core/services';
import { SKIP_LOADING } from './http-context.tokens';
import { finalize } from 'rxjs';

/**
 * Increments / decrements the global loading counter around every HTTP request.
 * Requests with `SKIP_LOADING` context token set to `true` are excluded.
 */
export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.context.get(SKIP_LOADING)) return next(req);

  const loadingService = inject(LoadingService);

  loadingService.start();
  return next(req).pipe(finalize(() => loadingService.stop()));
};
