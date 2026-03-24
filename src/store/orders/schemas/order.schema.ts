import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OrderDocument = HydratedDocument<Order>;

export enum OrderStatus {
  PAID = 'paid',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
}

export enum OrderSource {
  BUY_NOW = 'buy_now',
  CART = 'cart',
}

@Schema({ _id: false })
export class OrderItem {
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

export const OrderItemSchema = SchemaFactory.createForClass(OrderItem);

@Schema({ timestamps: true })
export class Order {
  @Prop({ required: true, unique: true, index: true })
  orderNumber: string;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  buyerId: Types.ObjectId;

  @Prop({ type: [OrderItemSchema], default: [] })
  items: OrderItem[];

  @Prop({ required: true, min: 0 })
  subtotal: number;

  @Prop({ required: true, min: 0, default: 0 })
  discountTotal: number;

  @Prop({ required: true, min: 0 })
  total: number;

  @Prop({ trim: true, uppercase: true, default: 'VND' })
  currency: string;

  @Prop({ type: String, enum: OrderStatus, default: OrderStatus.PAID })
  status: OrderStatus;

  @Prop({ type: String, enum: OrderSource, default: OrderSource.BUY_NOW })
  source: OrderSource;

  @Prop({ trim: true, maxlength: 128 })
  idempotencyKey?: string;

  @Prop({ type: Types.ObjectId })
  transactionId?: Types.ObjectId;

  @Prop({ type: Date })
  paidAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const OrderSchema = SchemaFactory.createForClass(Order);

OrderSchema.index({ buyerId: 1, createdAt: -1 });
OrderSchema.index({ buyerId: 1, status: 1, createdAt: -1 });
OrderSchema.index({ buyerId: 1, idempotencyKey: 1 }, { unique: true, sparse: true });
