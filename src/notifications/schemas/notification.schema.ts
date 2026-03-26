import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type NotificationDocument = HydratedDocument<Notification>;

export enum NotificationCategory {
  SUBSCRIPTION = 'subscription',
  TICKET = 'ticket',
  BLOG = 'blog',
  STORE = 'store',
  WALLET = 'wallet',
  GAMIFICATION = 'gamification',
  SOCIAL = 'social',
}

export enum NotificationType {
  SUBSCRIPTION_REMINDER = 'subscription_reminder',
  SUBSCRIPTION_RENEWED = 'subscription_renewed',
  SUBSCRIPTION_FAILED = 'subscription_failed',
  SUBSCRIPTION_EXPIRED = 'subscription_expired',

  TICKET_CREATED = 'ticket_created',
  TICKET_REPLY = 'ticket_reply',
  TICKET_ASSIGNED = 'ticket_assigned',
  TICKET_STATUS_CHANGED = 'ticket_status_changed',

  BLOG_POST_APPROVED = 'blog_post_approved',
  BLOG_POST_REJECTED = 'blog_post_rejected',

  STORE_ORDER_CREATED = 'store_order_created',
  STORE_QUOTE_CREATED = 'store_quote_created',
  STORE_QUOTE_ACCEPTED = 'store_quote_accepted',
  STORE_QUOTE_REJECTED = 'store_quote_rejected',
  STORE_DELIVERY_UPLOADED = 'store_delivery_uploaded',
  STORE_ORDER_COMPLETED = 'store_order_completed',
  STORE_ORDER_AUTO_COMPLETED = 'store_order_auto_completed',

  WALLET_DEPOSIT_COMPLETED = 'wallet_deposit_completed',
  WALLET_DEPOSIT_FAILED = 'wallet_deposit_failed',
  WALLET_DEPOSIT_CANCELLED = 'wallet_deposit_cancelled',
  WALLET_ADMIN_ADJUSTED = 'wallet_admin_adjusted',

  BADGE_EARNED = 'badge_earned',
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
