import {
  provideRouter,
  TitleStrategy,
  withComponentInputBinding,
  withViewTransitions,
} from '@angular/router';
import {
  ApplicationConfig,
  ErrorHandler,
  isDevMode,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import {
  Language,
  TranslocoHttpLoader,
  AppTitleStrategy,
  authInterceptor,
  refreshInterceptor,
  loadingInterceptor,
  errorInterceptor,
  GlobalErrorHandler,
} from '@core/index';
import { provideTransloco } from '@ngneat/transloco';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding(), withViewTransitions()),
    provideClientHydration(withEventReplay()),
    provideHttpClient(
      withFetch(),
      withInterceptors([loadingInterceptor, authInterceptor, refreshInterceptor, errorInterceptor]),
    ),
    provideTransloco({
      config: {
        availableLangs: [Language.EN, Language.PL],
        defaultLang: Language.EN,
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
      },
      loader: TranslocoHttpLoader,
    }),

    { provide: TitleStrategy, useClass: AppTitleStrategy },
  ],
};
