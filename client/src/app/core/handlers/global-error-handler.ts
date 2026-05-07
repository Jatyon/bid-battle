import { ErrorHandler, Injectable, NgZone, inject, isDevMode } from '@angular/core';
import { NotificationService } from '@core/index';

/**
 * Global error handler — catches all unhandled errors that escape Angular's
 * change detection: errors thrown in component lifecycle hooks, unhandled
 * promise rejections forwarded by `provideBrowserGlobalErrorListeners()`,
 * errors inside RxJS subscriptions that lack a `catchError`, etc.
 *
 * What it does:
 *  – Logs the full error to the console in every environment.
 *  – Shows a generic i18n error toast so the user knows something went wrong.
 *  – In dev mode re-throws so the error still appears in the browser DevTools
 *    overlay (preserving the familiar red-screen DX).
 *
 * What it intentionally does NOT do:
 *  – Handle HTTP errors — those are covered by `errorInterceptor`.
 *  – Show the raw error message to the user (security / UX concern).
 *
 * To integrate an external error tracker (e.g. Sentry) add the call inside
 * `handleError()` where indicated by the comment below.
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  // NgZone is needed because Angular error handler runs outside the zone —
  // without it, the signal update in NotificationService won't trigger CD.
  private readonly zone = inject(NgZone);
  private readonly notifications = inject(NotificationService);

  handleError(error: unknown): void {
    console.error('[GlobalErrorHandler] Unhandled error:', error);

    // ── External error tracking hook ──────────────────────────────────────
    // e.g. Sentry.captureException(error);
    // ─────────────────────────────────────────────────────────────────────

    this.zone.run(() => {
      this.notifications.error('ERRORS.UNEXPECTED', true);
    });

    if (isDevMode()) throw error;
  }
}
