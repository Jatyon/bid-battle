import { DestroyRef, Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { environment } from '@env/environment';
import { TranslocoService } from '@jsverse/transloco';
import { take } from 'rxjs';

const APP_NAME = environment.appName;
const BLINK_INTERVAL_MS = 2000;

/**
 * Global page title service.
 *
 * Features:
 * - Sets the tab title: "Page Name | BidBattle"
 * - Blinking title when the tab is inactive and there's a new notification:
 *   "New message!" <-> "Auctions | BidBattle"
 */
@Injectable({ providedIn: 'root' })
export class TitleService {
  private readonly titleApi = inject(Title);
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly destroyRef = inject(DestroyRef);

  // Reactive state signals
  private readonly _baseTitle = signal(APP_NAME);
  private readonly _unreadCount = signal(0);
  private readonly _isBlinking = signal(false);

  // Read-only public signals
  readonly baseTitle = this._baseTitle.asReadonly();
  readonly unreadCount = this._unreadCount.asReadonly();
  readonly isBlinking = this._isBlinking.asReadonly();

  // Derived title signal
  readonly resolvedTitle = computed(() => {
    const count = this._unreadCount();
    const base = this._baseTitle();
    return count > 0 ? `(${count}) ${base}` : base;
  });

  private blinkIntervalId: ReturnType<typeof setInterval> | null = null;
  private blinkMessage = '';
  private blinkState = false;

  private readonly visibilityHandler = () => {
    if (!this.document.hidden && this.blinkIntervalId) this.stopBlink();
  };

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.stopBlink();
      if (this.isBrowser)
        this.document.removeEventListener('visibilitychange', this.visibilityHandler);
    });
    if (this.isBrowser) this.document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  /** Sets the page title. Called by TitleStrategy or manually. */
  setTitle(pageTitle: string): void {
    this._baseTitle.set(pageTitle ? `${pageTitle} | ${APP_NAME}` : APP_NAME);
    this.applyTitle();
  }

  /** Updates the unread notification count displayed in the title. */
  setUnreadCount(count: number): void {
    this._unreadCount.set(count);
    this.applyTitle();
  }

  /**
   * Starts a blinking tab title when the tab is in the background.
   * Blinks between `blinkMessage` and the current page title.
   *
   * @param message  Text displayed on every other blink, e.g., "New notification!"
   * @param intervalMs  Time between changes in ms (defaults to 2000)
   */
  startBlink(message: string, intervalMs = BLINK_INTERVAL_MS): void {
    if (!this.isBrowser) return;
    if (this.blinkIntervalId) return;
    if (!this.document.hidden) return; // Do not blink if tab is active

    this.blinkMessage = message;
    this.blinkState = true;
    this._isBlinking.set(true);
    this.titleApi.setTitle(this.blinkMessage);

    this.blinkIntervalId = setInterval(() => {
      this.blinkState = !this.blinkState;
      this.titleApi.setTitle(this.blinkState ? this.blinkMessage : this.resolvedTitle());
    }, intervalMs);
  }

  /** Stops blinking and restores the normal title. */
  stopBlink(): void {
    if (!this.blinkIntervalId) return;

    clearInterval(this.blinkIntervalId);
    this.blinkIntervalId = null;
    this.blinkState = false;
    this._isBlinking.set(false);
    this.applyTitle();
  }

  private applyTitle(): void {
    if (this.blinkIntervalId) return;
    this.titleApi.setTitle(this.resolvedTitle());
  }
}

/**
 * Custom title strategy for the Angular Router.
 * Reads the `title` field from the route definition, treats it as a Transloco
 * translation key, and passes the resolved string to TitleService.
 *
 * Registration in app.config.ts:
 * { provide: TitleStrategy, useClass: AppTitleStrategy }
 */
@Injectable({ providedIn: 'root' })
export class AppTitleStrategy extends TitleStrategy {
  private readonly titleService = inject(TitleService);
  private readonly transloco = inject(TranslocoService);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.titleService.stopBlink();

    const key = this.buildTitle(snapshot);

    if (!key) {
      this.titleService.setTitle('');
      return;
    }

    this.transloco
      .selectTranslate(key)
      .pipe(take(1))
      .subscribe((translated) => this.titleService.setTitle(translated));
  }
}
