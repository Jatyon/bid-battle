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
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import {
  Language,
  LanguageService,
  TranslocoHttpLoader,
  AppTitleStrategy,
  languageInterceptor,
  authInterceptor,
  refreshInterceptor,
  loadingInterceptor,
  errorInterceptor,
  GlobalErrorHandler,
} from '@core/index';
import { provideTransloco } from '@jsverse/transloco';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding(), withViewTransitions()),
    provideClientHydration(withEventReplay()),
    provideHttpClient(
      withFetch(),
      withInterceptors([
        languageInterceptor,
        loadingInterceptor,
        authInterceptor,
        refreshInterceptor,
        errorInterceptor,
      ]),
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
    provideAppInitializer(() => {
      inject(LanguageService).init();
    }),

    { provide: TitleStrategy, useClass: AppTitleStrategy },
  ],
};
