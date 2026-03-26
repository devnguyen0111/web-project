import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UserBadgeDocument = HydratedDocument<UserBadge>;

@Schema({ timestamps: true })
export class UserBadge {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  badgeId: Types.ObjectId;

  @Prop({ required: true, trim: true, lowercase: true, maxlength: 100 })
  badgeCode: string;

  @Prop({ type: Date, required: true })
  awardedAt: Date;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;

  createdAt: Date;
  updatedAt: Date;
}

export const UserBadgeSchema = SchemaFactory.createForClass(UserBadge);

UserBadgeSchema.index({ userId: 1, badgeCode: 1 }, { unique: true });
UserBadgeSchema.index({ userId: 1, awardedAt: -1 });
