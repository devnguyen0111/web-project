import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ReviewDocument = HydratedDocument<Review>;

export enum ReviewTargetType {
  PRODUCT = 'product',
  STORE = 'store',
}

@Schema({ _id: false })
export class ReviewAspects {
  @Prop({ min: 1, max: 5 })
  quality?: number;

  @Prop({ min: 1, max: 5 })
  delivery?: number;

  @Prop({ min: 1, max: 5 })
  communication?: number;
}

export const ReviewAspectsSchema = SchemaFactory.createForClass(ReviewAspects);

@Schema({ _id: false })
export class ReviewReply {
  @Prop({ required: true, trim: true, maxlength: 1000 })
  message: string;

  @Prop({ type: Types.ObjectId, required: true })
  repliedBy: Types.ObjectId;

  @Prop({ type: Date, required: true })
  repliedAt: Date;
}

export const ReviewReplySchema = SchemaFactory.createForClass(ReviewReply);

@Schema({ timestamps: true })
export class Review {
  @Prop({ type: String, enum: ReviewTargetType, required: true, index: true })
  targetType: ReviewTargetType;

  @Prop({ type: Types.ObjectId, index: true })
  productId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  reviewerId: Types.ObjectId;

  @Prop({ required: true, min: 1, max: 5 })
  rating: number;

  @Prop({ type: ReviewAspectsSchema, default: () => ({}) })
  aspects?: ReviewAspects;

  @Prop({ trim: true, maxlength: 2000 })
  content?: string;

  @Prop({ type: ReviewReplySchema })
  staffReply?: ReviewReply;

  createdAt: Date;
  updatedAt: Date;
}

export const ReviewSchema = SchemaFactory.createForClass(Review);

ReviewSchema.index({ targetType: 1, productId: 1, createdAt: -1 });
ReviewSchema.index(
  { reviewerId: 1, targetType: 1, productId: 1 },
  {
    unique: true,
    partialFilterExpression: { targetType: ReviewTargetType.PRODUCT },
  },
);
ReviewSchema.index(
  { reviewerId: 1, targetType: 1 },
  {
    unique: true,
    partialFilterExpression: { targetType: ReviewTargetType.STORE },
  },
);
