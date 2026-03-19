import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import { NotificationQueryDto } from './dto/notification-query.dto';
import {
  Notification,
  NotificationCategory,
  NotificationDocument,
  NotificationType,
} from './schemas/notification.schema';

type NotificationPayload = Record<string, unknown>;

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<Notification>,
  ) {}

  async createSubscriptionNotification(input: {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    metadata?: Record<string, unknown>;
  }): Promise<NotificationDocument> {
    const [created] = await this.notificationModel.create([
      {
        userId: new Types.ObjectId(input.userId),
        category: NotificationCategory.SUBSCRIPTION,
        type: input.type,
        title: input.title,
        message: input.message,
        metadata: input.metadata,
      },
    ]);

    return created;
  }

  async listMine(
    userId: string,
    query: NotificationQueryDto,
  ): Promise<PaginatedResponseDto<NotificationPayload>> {
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
      items.map((item) => item.toObject({ virtuals: true }) as NotificationPayload),
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

  async markRead(
    userId: string,
    id: string,
  ): Promise<NotificationPayload> {
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
    }

    return notification.toObject({ virtuals: true }) as NotificationPayload;
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.notificationModel.updateMany(
      {
        userId: new Types.ObjectId(userId),
        readAt: { $exists: false },
      },
      { $set: { readAt: new Date() } },
    );

    return { updated: result.modifiedCount ?? 0 };
  }
}
