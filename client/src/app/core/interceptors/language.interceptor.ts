import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { LanguageService } from '@core/services/language.service';

/**
 * Sends the active UI language to the API so backend i18n matches the frontend.
 * Overrides the browser's default Accept-Language header on fetch/XHR requests.
 */
export const languageInterceptor: HttpInterceptorFn = (req, next) => {
  const acceptLanguage = inject(LanguageService).getAcceptLanguageHeader();

  return next(
    req.clone({
      setHeaders: { 'Accept-Language': acceptLanguage },
    }),
  );
};
