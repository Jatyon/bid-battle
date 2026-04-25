import { Injectable, computed, signal } from '@angular/core';
import { NotificationType, Notification } from '@core/index';

const DEFAULT_DURATION = 4000;

/**
 * Global notification (toast) service.
 * Use it to push success/error/warning/info messages from anywhere in the app.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly _notifications = signal<Notification[]>([]);

  readonly notifications = computed(() => this._notifications());

  success(message: string, duration = DEFAULT_DURATION): void {
    this.push(message, NotificationType.Success, duration);
  }

  error(message: string, duration = DEFAULT_DURATION): void {
    this.push(message, NotificationType.Error, duration);
  }

  warning(message: string, duration = DEFAULT_DURATION): void {
    this.push(message, NotificationType.Warning, duration);
  }

  info(message: string, duration = DEFAULT_DURATION): void {
    this.push(message, NotificationType.Info, duration);
  }

  dismiss(id: string): void {
    this._notifications.update((list) => list.filter((n) => n.id !== id));
  }

  private push(message: string, type: NotificationType, duration: number): void {
    const id = crypto.randomUUID();
    this._notifications.update((list) => [...list, { id, message, type, duration }]);

    if (duration > 0) setTimeout(() => this.dismiss(id), duration);
  }
}
