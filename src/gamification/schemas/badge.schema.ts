import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type BadgeDocument = HydratedDocument<Badge>;

export enum BadgeCriteriaType {
  POSTS_PUBLISHED = 'posts_published',
  SALES_COUNT = 'sales_count',
  LEVEL_REACHED = 'level_reached',
}

@Schema({ _id: false })
export class BadgeCriteria {
  @Prop({ type: String, enum: BadgeCriteriaType, required: true })
  type: BadgeCriteriaType;

  @Prop({ type: Number, required: true, min: 1 })
  threshold: number;
}

export const BadgeCriteriaSchema = SchemaFactory.createForClass(BadgeCriteria);

@Schema({ timestamps: true })
export class Badge {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  code: string;

  @Prop({ required: true, trim: true, maxlength: 120 })
  name: string;

  @Prop({ trim: true, maxlength: 500 })
  description?: string;

  @Prop({ trim: true, maxlength: 500 })
  iconUrl?: string;

  @Prop({ type: BadgeCriteriaSchema, required: true })
  criteria: BadgeCriteria;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: Number, min: 0, default: 0 })
  xpReward: number;

  createdAt: Date;
  updatedAt: Date;
}

export const BadgeSchema = SchemaFactory.createForClass(Badge);

BadgeSchema.index({ isActive: 1, createdAt: -1 });
