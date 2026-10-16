import { DestroyRef, Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { StorageService } from './storage.service';

export type Theme = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly STORAGE_KEY = 'theme';
  private readonly storage = inject(StorageService);
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly destroyRef = inject(DestroyRef);

  private readonly _currentTheme = signal<Theme>('dark');
  readonly currentTheme = this._currentTheme.asReadonly();

  /**
   * Stored so we can remove it on destroy and avoid a memory leak
   * (relevant in tests and potential future SSR de-hydration scenarios).
   * Not readonly — nullified after removal to accurately track listener state.
   */
  private _mediaQueryListener: ((e: MediaQueryListEvent) => void) | null = null;
  private _mediaQuery: MediaQueryList | null = null;
  private _initialized = false;

  constructor() {
    this.destroyRef.onDestroy(() => this.removeMediaQueryListener());
    this.init();
  }

  /**
   * Initializes theme preference and OS media query listener.
   * Can be called explicitly at app startup (APP_INITIALIZER) or implicitly by constructor.
   */
  init(): void {
    if (!this.isBrowser || this._initialized) return;

    this._initialized = true;

    const saved = this.storage.get(this.STORAGE_KEY) as Theme | null;

    this._mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const preferred: Theme = this._mediaQuery.matches ? 'dark' : 'light';

    // If the user has previously saved an explicit preference, honour it.
    // Otherwise follow the OS setting — including future changes.
    this.applyTheme(saved ?? preferred, saved !== null);

    // Only mirror OS changes when the user has NOT set a manual preference.
    // Once they call toggle(), the saved value takes over and OS changes are ignored.
    if (!saved) {
      this._mediaQueryListener = (e: MediaQueryListEvent) => {
        // Re-check storage: the user might have called toggle() between the
        // listener being registered and this event firing.
        if (this.storage.get(this.STORAGE_KEY)) return;
        this.applyTheme(e.matches ? 'dark' : 'light', false);
      };
      this._mediaQuery.addEventListener('change', this._mediaQueryListener);
    }
  }

  toggle(): void {
    const next: Theme = this.currentTheme() === 'dark' ? 'light' : 'dark';

    // Toggling sets an explicit user preference — stop following OS changes.
    this.removeMediaQueryListener();

    this.applyTheme(next, true);
  }

  private removeMediaQueryListener(): void {
    if (this._mediaQuery && this._mediaQueryListener) {
      this._mediaQuery.removeEventListener('change', this._mediaQueryListener);
      this._mediaQueryListener = null;
    }
  }

  private applyTheme(theme: Theme, persist: boolean): void {
    if (this.isBrowser) this.document.documentElement.setAttribute('data-theme', theme);
    if (persist) this.storage.set(this.STORAGE_KEY, theme);
    this._currentTheme.set(theme);
  }
}
