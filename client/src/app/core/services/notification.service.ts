import { Injectable, computed, inject, signal } from '@angular/core';
import { NotificationType, Notification } from '@core/index';
import { TranslocoService } from '@ngneat/transloco';
import { take } from 'rxjs';

const DEFAULT_DURATION = 4000;

/**
 * Global notification service.
 * Use it to push success/error/warning/info messages from anywhere in the app.
 * Both plain messages and i18n translation keys are supported.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly translocoService = inject(TranslocoService);
  private readonly _notifications = signal<Notification[]>([]);

  readonly notifications = computed(() => this._notifications());

  success(message: string, translate = true, duration = DEFAULT_DURATION): void {
    this.push(message, NotificationType.Success, duration, translate);
  }

  error(message: string, translate = true, duration = DEFAULT_DURATION): void {
    this.push(message, NotificationType.Error, duration, translate);
  }

  warning(message: string, duration = DEFAULT_DURATION, translate = true): void {
    this.push(message, NotificationType.Warning, duration, translate);
  }

  info(message: string, translate = true, duration = DEFAULT_DURATION): void {
    this.push(message, NotificationType.Info, duration, translate);
  }

  dismiss(id: string): void {
    this._notifications.update((list) => list.filter((n) => n.id !== id));
  }

  private push(message: string, type: NotificationType, duration: number, translate = true): void {
    if (!translate) {
      this.pushNotification(message, type, duration);
      return;
    }

    this.translocoService
      .selectTranslate(message)
      .pipe(take(1))
      .subscribe((translatedMessage) => this.pushNotification(translatedMessage, type, duration));
  }

  private pushNotification(message: string, type: NotificationType, duration: number): void {
    const id = crypto.randomUUID();
    this._notifications.update((list) => [...list, { id, message, type, duration }]);

    if (duration > 0) setTimeout(() => this.dismiss(id), duration);
  }
}
