import { Injectable, computed, inject, signal } from '@angular/core';
import { NotificationType, Notification } from '@core/index';
import { TranslocoService } from '@jsverse/transloco';
import { take } from 'rxjs';

const DEFAULT_DURATION = 4000;
const MAX_NOTIFICATIONS = 5;
const EXIT_ANIMATION_DURATION = 240;

/**
 * Global notification service.
 * Use it to push success/error/warning/info messages from anywhere in the app.
 * Both plain messages and i18n translation keys are supported.
 *
 * Deduplication: if a notification with the same message + type is already
 * visible, the duplicate is suppressed and the existing notification's
 * auto-dismiss timer is reset instead. This prevents toast storms caused by
 * rapid repeated actions (e.g. double-clicking "Place bid") or multiple
 * in-flight requests all failing with the same error at once.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly translocoService = inject(TranslocoService);
  private readonly _notifications = signal<Notification[]>([]);

  /** Active auto-dismiss timers keyed by notification id. */
  private readonly _timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly _removalTimers = new Map<string, ReturnType<typeof setTimeout>>();

  readonly notifications = computed(() => this._notifications());

  success(
    message: string,
    translate = true,
    duration = DEFAULT_DURATION,
    params?: Record<string, unknown>,
  ): void {
    this.push(message, NotificationType.Success, duration, translate, params);
  }

  error(
    message: string,
    translate = true,
    duration = DEFAULT_DURATION,
    params?: Record<string, unknown>,
  ): void {
    this.push(message, NotificationType.Error, duration, translate, params);
  }

  warning(
    message: string,
    translate = true,
    duration = DEFAULT_DURATION,
    params?: Record<string, unknown>,
  ): void {
    this.push(message, NotificationType.Warning, duration, translate, params);
  }

  info(
    message: string,
    translate = true,
    duration = DEFAULT_DURATION,
    params?: Record<string, unknown>,
  ): void {
    this.push(message, NotificationType.Info, duration, translate, params);
  }

  dismiss(id: string): void {
    clearTimeout(this._timers.get(id));
    this._timers.delete(id);
    this.cancelRemoval(id);

    const notification = this._notifications().find((n) => n.id === id);
    if (!notification || notification.isLeaving) {
      return;
    }

    this._notifications.update((list) =>
      list.map((n) => (n.id === id ? { ...n, isLeaving: true } : n)),
    );
    const timer = setTimeout(() => this.removeNotification(id), EXIT_ANIMATION_DURATION);
    this._removalTimers.set(id, timer);
  }

  private push(
    message: string,
    type: NotificationType,
    duration: number,
    translate = true,
    params?: Record<string, unknown>,
  ): void {
    if (!translate) {
      this.pushNotification(message, type, duration);
      return;
    }

    this.translocoService
      .selectTranslate(message, params)
      .pipe(take(1))
      .subscribe((translatedMessage) => this.pushNotification(translatedMessage, type, duration));
  }

  private pushNotification(message: string, type: NotificationType, duration: number): void {
    const existing = this._notifications().find((n) => n.message === message && n.type === type);

    if (existing) {
      if (existing.isLeaving) {
        this._notifications.update((list) =>
          list.map((n) => (n.id === existing.id ? { ...n, isLeaving: false } : n)),
        );
        this.cancelRemoval(existing.id);
      }

      this.resetTimer(existing.id, duration);
      return;
    }

    const id = crypto.randomUUID();
    this._notifications.update((list) => {
      const updated = [...list, { id, message, type, duration }];
      return updated.length > MAX_NOTIFICATIONS ? updated.slice(-MAX_NOTIFICATIONS) : updated;
    });

    this.scheduleAutoDismiss(id, duration);
  }

  /**
   * Cancels the existing timer for a notification and starts a fresh one.
   * Used when a duplicate notification is suppressed — the visible toast
   * "blinks" by restarting its countdown, giving the user feedback that
   * the action was received again without adding clutter.
   */
  private resetTimer(id: string, duration: number): void {
    clearTimeout(this._timers.get(id));
    this.scheduleAutoDismiss(id, duration);
  }

  private cancelRemoval(id: string): void {
    clearTimeout(this._removalTimers.get(id));
    this._removalTimers.delete(id);
  }

  private removeNotification(id: string): void {
    this._removalTimers.delete(id);
    this._notifications.update((list) => list.filter((n) => n.id !== id));
  }

  private scheduleAutoDismiss(id: string, duration: number): void {
    if (duration <= 0) return;
    const timer = setTimeout(() => this.dismiss(id), duration);
    this._timers.set(id, timer);
  }
}
