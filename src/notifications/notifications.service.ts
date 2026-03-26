import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { NotificationResponseDto } from './dto/notification-response.dto';
import { NotificationsRealtimePublisher } from './notifications.realtime.publisher';
import {
  Notification,
  NotificationCategory,
  NotificationDocument,
  NotificationType,
} from './schemas/notification.schema';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<Notification>,
    private readonly realtimePublisher: NotificationsRealtimePublisher,
  ) {}

  async createSubscriptionNotification(input: {
    userId: string;
    email?: string;
    type: NotificationType;
    title: string;
    message: string;
    metadata?: Record<string, unknown>;
  }): Promise<NotificationDocument> {
    return this.createNotification({
      userId: input.userId,
      category: NotificationCategory.SUBSCRIPTION,
      type: input.type,
      title: input.title,
      message: input.message,
      metadata: input.metadata,
    });
  }

  async createTicketNotification(input: {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    metadata?: Record<string, unknown>;
  }): Promise<NotificationDocument> {
    return this.createNotification({
      userId: input.userId,
      category: NotificationCategory.TICKET,
      type: input.type,
      title: input.title,
      message: input.message,
      metadata: input.metadata,
    });
  }

  async createBlogNotification(input: {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    metadata?: Record<string, unknown>;
  }): Promise<NotificationDocument> {
    return this.createNotification({
      userId: input.userId,
      category: NotificationCategory.BLOG,
      type: input.type,
      title: input.title,
      message: input.message,
      metadata: input.metadata,
    });
  }

  async createStoreNotification(input: {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    metadata?: Record<string, unknown>;
  }): Promise<NotificationDocument> {
    return this.createNotification({
      userId: input.userId,
      category: NotificationCategory.STORE,
      type: input.type,
      title: input.title,
      message: input.message,
      metadata: input.metadata,
    });
  }

  async createWalletNotification(input: {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    metadata?: Record<string, unknown>;
  }): Promise<NotificationDocument> {
    return this.createNotification({
      userId: input.userId,
      category: NotificationCategory.WALLET,
      type: input.type,
      title: input.title,
      message: input.message,
      metadata: input.metadata,
    });
  }

  async createGamificationNotification(input: {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    metadata?: Record<string, unknown>;
  }): Promise<NotificationDocument> {
    return this.createNotification({
      userId: input.userId,
      category: NotificationCategory.GAMIFICATION,
      type: input.type,
      title: input.title,
      message: input.message,
      metadata: input.metadata,
    });
  }

  async createForUsers(input: {
    userIds: string[];
    category: NotificationCategory;
    type: NotificationType;
    title: string;
    message: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const deduped = [...new Set(input.userIds.filter(Boolean))];
    await Promise.all(
      deduped.map((userId) =>
        this.createNotification({
          userId,
          category: input.category,
          type: input.type,
          title: input.title,
          message: input.message,
          metadata: input.metadata,
        }),
      ),
    );
  }

  async createNotification(input: {
    userId: string;
    category: NotificationCategory;
    type: NotificationType;
    title: string;
    message: string;
    metadata?: Record<string, unknown>;
  }): Promise<NotificationDocument> {
    const [created] = await this.notificationModel.create([
      {
        userId: new Types.ObjectId(input.userId),
        category: input.category,
        type: input.type,
        title: input.title,
        message: input.message,
        metadata: input.metadata,
      },
    ]);

    const response = this.toNotificationResponse(created);
    this.realtimePublisher.emitNotificationCreated(input.userId, response);
    await this.emitUnreadCount(input.userId);

    return created;
  }

  async listMine(
    userId: string,
    query: NotificationQueryDto,
  ): Promise<PaginatedResponseDto<NotificationResponseDto>> {
    const skip = (query.page - 1) * query.limit;
    const filter = { userId: new Types.ObjectId(userId) };
    const [items, total] = await Promise.all([
      this.notificationModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(query.limit)
        .exec(),
      this.notificationModel.countDocuments(filter),
    ]);

    return new PaginatedResponseDto(
      items.map((item) => this.toNotificationResponse(item)),
      total,
      query.page,
      query.limit,
    );
  }

  async getUnreadCount(userId: string): Promise<{ unreadCount: number }> {
    const unreadCount = await this.notificationModel.countDocuments({
      userId: new Types.ObjectId(userId),
      readAt: { $exists: false },
    });
    return { unreadCount };
  }

  async markRead(userId: string, id: string): Promise<NotificationResponseDto> {
    const notification = await this.notificationModel
      .findOne({
        _id: new Types.ObjectId(id),
        userId: new Types.ObjectId(userId),
      })
      .exec();
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (!notification.readAt) {
      notification.readAt = new Date();
      await notification.save();
      this.realtimePublisher.emitNotificationRead(
        userId,
        notification.id,
        notification.readAt,
      );
      await this.emitUnreadCount(userId);
    }

    return this.toNotificationResponse(notification);
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const readAt = new Date();
    const result = await this.notificationModel.updateMany(
      {
        userId: new Types.ObjectId(userId),
        readAt: { $exists: false },
      },
      { $set: { readAt } },
    );

    const updated = result.modifiedCount ?? 0;
    if (updated > 0) {
      this.realtimePublisher.emitNotificationsReadAll(userId, updated, readAt);
      await this.emitUnreadCount(userId);
    }

    return { updated };
  }

  private toNotificationResponse(
    notification: NotificationDocument,
  ): NotificationResponseDto {
    return {
      id: notification.id,
      userId: notification.userId.toString(),
      category: notification.category,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      readAt: notification.readAt,
      metadata: notification.metadata,
      createdAt: notification.createdAt,
      updatedAt: notification.updatedAt,
    };
  }

  private async emitUnreadCount(userId: string): Promise<void> {
    const { unreadCount } = await this.getUnreadCount(userId);
    this.realtimePublisher.emitUnreadCount(userId, unreadCount);
  }
}
