import { Injectable, OnDestroy, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { StorageService } from './storage.service';

export type Theme = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService implements OnDestroy {
  private readonly STORAGE_KEY = 'theme';
  private readonly storage = inject(StorageService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly _currentTheme = signal<Theme>('dark');
  readonly currentTheme = this._currentTheme.asReadonly();

  /**
   * Stored so we can remove it in ngOnDestroy and avoid a memory leak
   * (relevant in tests and potential future SSR de-hydration scenarios).
   * Not readonly — nullified after removal to accurately track listener state.
   */
  private _mediaQueryListener: ((e: MediaQueryListEvent) => void) | null = null;
  private _mediaQuery: MediaQueryList | null = null;

  constructor() {
    if (!this.isBrowser) return;

    const saved = this.storage.get(this.STORAGE_KEY) as Theme | null;

    this._mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const preferred: Theme = this._mediaQuery.matches ? 'dark' : 'light';

    // If the user has previously saved an explicit preference, honour it.
    // Otherwise follow the OS setting — including future changes.
    this.applyTheme(saved ?? preferred);

    // Only mirror OS changes when the user has NOT set a manual preference.
    // Once they call toggle(), the saved value takes over and OS changes are ignored.
    if (!saved) {
      this._mediaQueryListener = (e: MediaQueryListEvent) => {
        // Re-check storage: the user might have called toggle() between the
        // listener being registered and this event firing.
        if (this.storage.get(this.STORAGE_KEY)) return;
        this.applyTheme(e.matches ? 'dark' : 'light');
      };
      this._mediaQuery.addEventListener('change', this._mediaQueryListener);
    }
  }

  toggle(): void {
    const next: Theme = this.currentTheme() === 'dark' ? 'light' : 'dark';

    // Toggling sets an explicit user preference — stop following OS changes.
    this.removeMediaQueryListener();

    this.applyTheme(next);
  }

  ngOnDestroy(): void {
    this.removeMediaQueryListener();
  }

  private removeMediaQueryListener(): void {
    if (this._mediaQuery && this._mediaQueryListener) {
      this._mediaQuery.removeEventListener('change', this._mediaQueryListener);
      this._mediaQueryListener = null;
    }
  }

  private applyTheme(theme: Theme): void {
    if (this.isBrowser) document.documentElement.setAttribute('data-theme', theme);
    this.storage.set(this.STORAGE_KEY, theme);
    this._currentTheme.set(theme);
  }
}
