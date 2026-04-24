import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { Injectable, OnDestroy, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { environment } from '@env/environment';

const APP_NAME = environment.appName;
const BLINK_INTERVAL_MS = 2000;

/**
 * Global page title service.
 *
 * Features:
 * - Sets the tab title: "Page Name | BidBattle"
 * - Blinking title when the tab is inactive and there's a new notification:
 * "New message!" <-> "Auctions | BidBattle"
 */
@Injectable({ providedIn: 'root' })
export class TitleService implements OnDestroy {
  private readonly titleApi = inject(Title);

  private baseTitle = APP_NAME;
  private unreadCount = 0;
  private blinkIntervalId: ReturnType<typeof setInterval> | null = null;
  private blinkMessage = '';
  private blinkState = false;

  /** Sets the page title. Called by TitleStrategy or manually. */
  setTitle(pageTitle: string): void {
    this.baseTitle = pageTitle ? `${pageTitle} | ${APP_NAME}` : APP_NAME;
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
    if (this.blinkIntervalId) return;

    this.blinkMessage = message;
    this.blinkState = false;

    this.blinkIntervalId = setInterval(() => {
      this.blinkState = !this.blinkState;
      this.titleApi.setTitle(this.blinkState ? this.blinkMessage : this.resolvedTitle);
    }, intervalMs);
  }

  /** Stops blinking and restores the normal title. */
  stopBlink(): void {
    if (!this.blinkIntervalId) return;

    clearInterval(this.blinkIntervalId);
    this.blinkIntervalId = null;
    this.blinkState = false;
    this.applyTitle();
  }

  ngOnDestroy(): void {
    this.stopBlink();
  }

  private get resolvedTitle(): string {
    return this.unreadCount > 0 ? `(${this.unreadCount}) ${this.baseTitle}` : this.baseTitle;
  }

  private applyTitle(): void {
    if (this.blinkIntervalId) return;
    this.titleApi.setTitle(this.resolvedTitle);
  }
}

/**
 * Custom title strategy for the Angular Router.
 * Automatically reads the `title` field from the route definition
 * and passes it to the TitleService.
 *
 * Registration in app.config.ts:
 * { provide: TitleStrategy, useClass: AppTitleStrategy }
 */
@Injectable({ providedIn: 'root' })
export class AppTitleStrategy extends TitleStrategy {
  private readonly titleService = inject(TitleService);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const title = this.buildTitle(snapshot);
    this.titleService.setTitle(title ?? '');
  }
}
