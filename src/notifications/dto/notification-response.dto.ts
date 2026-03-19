import {
  NotificationCategory,
  NotificationType,
} from '../schemas/notification.schema';

export class NotificationResponseDto {
  id: string;
  userId: string;
  category: NotificationCategory;
  type: NotificationType;
  title: string;
  message: string;
  readAt?: Date;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}
