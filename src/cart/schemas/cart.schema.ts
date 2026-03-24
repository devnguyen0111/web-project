import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CartDocument = HydratedDocument<Cart>;

@Schema({ _id: true })
export class CartItem {
  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 160 })
  productName: string;

  @Prop({ required: true, trim: true, lowercase: true, maxlength: 180 })
  productSlug: string;

  @Prop({ required: true, min: 1 })
  unitPrice: number;

  @Prop({ required: true, min: 1 })
  quantity: number;

  @Prop({ required: true, min: 1 })
  lineTotal: number;

  @Prop({ trim: true, uppercase: true, default: 'VND' })
  currency: string;
}

export const CartItemSchema = SchemaFactory.createForClass(CartItem);

@Schema({ timestamps: true })
export class Cart {
  @Prop({ type: Types.ObjectId, required: true, unique: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: [CartItemSchema], default: [] })
  items: CartItem[];

  @Prop({ required: true, min: 0, default: 0 })
  subtotal: number;

  @Prop({ required: true, min: 0, default: 0 })
  discountTotal: number;

  @Prop({ required: true, min: 0, default: 0 })
  total: number;

  @Prop({ trim: true, uppercase: true, default: 'VND' })
  currency: string;

  createdAt: Date;
  updatedAt: Date;
}

export const CartSchema = SchemaFactory.createForClass(Cart);
