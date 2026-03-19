import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type NotificationDocument = HydratedDocument<Notification>;

export enum NotificationCategory {
  SUBSCRIPTION = 'subscription',
}

export enum NotificationType {
  SUBSCRIPTION_REMINDER = 'subscription_reminder',
  SUBSCRIPTION_RENEWED = 'subscription_renewed',
  SUBSCRIPTION_FAILED = 'subscription_failed',
  SUBSCRIPTION_EXPIRED = 'subscription_expired',
}

@Schema({ timestamps: true })
export class Notification {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({
    type: String,
    enum: NotificationCategory,
    default: NotificationCategory.SUBSCRIPTION,
  })
  category: NotificationCategory;

  @Prop({ type: String, enum: NotificationType, required: true, index: true })
  type: NotificationType;

  @Prop({ required: true, trim: true, maxlength: 120 })
  title: string;

  @Prop({ required: true, trim: true, maxlength: 1000 })
  message: string;

  @Prop({ type: Date, index: true })
  readAt?: Date;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;

  createdAt: Date;
  updatedAt: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });
