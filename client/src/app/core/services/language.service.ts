import { Injectable, PLATFORM_ID, REQUEST, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Language } from '@core/enums';
import { StorageService } from './storage.service';
import { TranslocoService } from '@jsverse/transloco';

const STORAGE_LANGUAGE_KEY = 'language';

/**
 * Keeps UI language (Transloco) in sync with API language (Accept-Language).
 *
 * Resolution order:
 *  1. Saved preference in localStorage
 *  2. Browser / SSR request Accept-Language
 *  3. App fallback (en)
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly storage = inject(StorageService);
  private readonly transloco = inject(TranslocoService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly request = inject(REQUEST, { optional: true });

  private readonly availableLangs = new Set<string>([Language.EN, Language.PL]);

  /** Call once at app startup (APP_INITIALIZER). */
  init(): void {
    const lang = this.resolveInitialLanguage();
    this.applyLanguage(lang, true);
  }

  getActiveLang(): Language {
    const active = this.transloco.getActiveLang();
    return this.isAvailable(active) ? (active as Language) : Language.EN;
  }

  /** Value for the Accept-Language HTTP header (matches active UI language). */
  getAcceptLanguageHeader(): string {
    return this.getActiveLang();
  }

  setLanguage(lang: Language): void {
    this.applyLanguage(lang, true);
  }

  private applyLanguage(lang: Language, persist: boolean): void {
    if (this.transloco.getActiveLang() !== lang) this.transloco.setActiveLang(lang);

    if (persist && isPlatformBrowser(this.platformId)) this.storage.set(STORAGE_LANGUAGE_KEY, lang);
  }

  private resolveInitialLanguage(): Language {
    const saved = this.storage.get(STORAGE_LANGUAGE_KEY);
    if (saved && this.isAvailable(saved)) return saved as Language;

    const fromRequest = this.detectFromAcceptLanguage(
      this.request?.headers.get('accept-language') ?? undefined,
    );
    if (fromRequest) return fromRequest;

    if (isPlatformBrowser(this.platformId)) return this.detectFromNavigator();

    return Language.EN;
  }

  private detectFromNavigator(): Language {
    const tags = navigator.languages?.length ? navigator.languages : [navigator.language];

    for (const tag of tags) {
      const match = this.detectFromAcceptLanguage(tag);
      if (match) return match;
    }

    return Language.EN;
  }

  private detectFromAcceptLanguage(raw?: string): Language | null {
    if (!raw?.trim()) return null;

    const primary = raw.split(',')[0]?.trim().split(';')[0]?.trim().toLowerCase();
    if (!primary) return null;

    const code = primary.split('-')[0];

    if (code === Language.PL) return Language.PL;
    if (code === Language.EN) return Language.EN;

    return null;
  }

  private isAvailable(lang: string): boolean {
    return this.availableLangs.has(lang);
  }
}
