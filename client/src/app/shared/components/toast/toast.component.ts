import { Component, inject } from '@angular/core';
import { Notification, NotificationType, NotificationService } from '@core/index';
import { TranslocoService } from '@jsverse/transloco';
import {
  LucideAngularModule,
  LucideIconData,
  CircleCheck,
  CircleX,
  TriangleAlert,
  Info,
  X,
} from 'lucide-angular';

@Component({
  selector: 'app-toast',
  templateUrl: './toast.component.html',
  styleUrl: './toast.component.scss',
  imports: [LucideAngularModule],
})
export class ToastComponent {
  private readonly notificationService = inject(NotificationService);
  private readonly transloco = inject(TranslocoService);

  readonly notifications = this.notificationService.notifications;
  readonly NotificationType = NotificationType;

  readonly closeLabel = () => this.transloco.translate('TOAST.CLOSE');

  readonly icons: Record<NotificationType, LucideIconData> = {
    [NotificationType.Success]: CircleCheck,
    [NotificationType.Error]: CircleX,
    [NotificationType.Warning]: TriangleAlert,
    [NotificationType.Info]: Info,
  };

  readonly closeIcon = X;

  dismiss(id: string): void {
    this.notificationService.dismiss(id);
  }

  trackById(_: number, item: Notification): string {
    return item.id;
  }
}
