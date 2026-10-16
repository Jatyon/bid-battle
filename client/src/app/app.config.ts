import {
  provideRouter,
  TitleStrategy,
  withComponentInputBinding,
  withInMemoryScrolling,
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
  ThemeService,
  AuthService,
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
import { catchError, of } from 'rxjs';

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withViewTransitions(),
      withInMemoryScrolling({
        scrollPositionRestoration: 'top',
        anchorScrolling: 'enabled',
      }),
    ),
    provideClientHydration(withEventReplay()),
    provideHttpClient(
      withFetch(),
      withInterceptors([
        languageInterceptor,
        loadingInterceptor,
        authInterceptor,
        errorInterceptor,
        refreshInterceptor,
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
    provideAppInitializer(() => {
      inject(ThemeService).init();
    }),

    provideAppInitializer(() => {
      const authService = inject(AuthService);
      if (authService.currentUser()) return authService.silentRefresh().pipe(catchError(() => of(false)));

      return;
    }),

    { provide: TitleStrategy, useClass: AppTitleStrategy },
  ],
};
