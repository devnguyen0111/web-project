import { Injectable } from '@nestjs/common';
import { NotificationResponseDto } from './dto/notification-response.dto';

export interface NotificationsRealtimeEmitter {
  emitNotificationCreated(
    userId: string,
    notification: NotificationResponseDto,
  ): void;
  emitUnreadCount(userId: string, unreadCount: number): void;
  emitNotificationRead(userId: string, id: string, readAt: Date): void;
  emitNotificationsReadAll(userId: string, updated: number, readAt: Date): void;
}

@Injectable()
export class NotificationsRealtimePublisher {
  private emitter?: NotificationsRealtimeEmitter;

  bindEmitter(emitter: NotificationsRealtimeEmitter): void {
    this.emitter = emitter;
  }

  emitNotificationCreated(
    userId: string,
    notification: NotificationResponseDto,
  ): void {
    this.emitter?.emitNotificationCreated(userId, notification);
  }

  emitUnreadCount(userId: string, unreadCount: number): void {
    this.emitter?.emitUnreadCount(userId, unreadCount);
  }

  emitNotificationRead(userId: string, id: string, readAt: Date): void {
    this.emitter?.emitNotificationRead(userId, id, readAt);
  }

  emitNotificationsReadAll(
    userId: string,
    updated: number,
    readAt: Date,
  ): void {
    this.emitter?.emitNotificationsReadAll(userId, updated, readAt);
  }
}
