import { NotificationType } from '@core/enums';

export interface Notification {
  id: string;
  message: string;
  type: NotificationType;
  duration?: number;
}
