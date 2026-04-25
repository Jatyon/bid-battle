import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { LoadingService } from '@core/services';
import { finalize } from 'rxjs';

/**
 * Increments / decrements the global loading counter around every HTTP request.
 */
export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  const loadingService = inject(LoadingService);

  loadingService.start();
  return next(req).pipe(finalize(() => loadingService.stop()));
};
