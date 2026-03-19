import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type CartItemDocument = HydratedDocument<CartItem>;

@Schema({ timestamps: true })
export class CartItem {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  productId: Types.ObjectId;

  @Prop({ required: true, min: 1, default: 1 })
  quantity: number;

  @Prop({ type: MongooseSchema.Types.Mixed })
  customData?: Record<string, unknown>;

  @Prop({ trim: true, maxlength: 1000 })
  buyerNote?: string;

  @Prop({ default: true })
  selected: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export const CartItemSchema = SchemaFactory.createForClass(CartItem);

CartItemSchema.index({ userId: 1, productId: 1 });
