import { provideRouter, TitleStrategy, withComponentInputBinding, withViewTransitions } from '@angular/router';
import { ApplicationConfig, isDevMode, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { Language, TranslocoHttpLoader, AppTitleStrategy } from '@core/index';
import { provideTransloco } from '@ngneat/transloco';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
     provideRouter(
      routes,
      withComponentInputBinding(),
      withViewTransitions(),
    ),
    provideClientHydration(withEventReplay()),
    provideHttpClient(),
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
