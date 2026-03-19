import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type OrderDocument = HydratedDocument<Order>;

export enum StoreProductType {
  DIGITAL = 'digital',
  CUSTOM_ORDER = 'custom_order',
}

export enum OrderStatus {
  PENDING = 'pending',
  PAID = 'paid',
  DELIVERED = 'delivered',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  REFUND_REQUESTED = 'refund_requested',
  REFUNDED = 'refunded',
  QUOTED = 'quoted',
  QUOTE_ACCEPTED = 'quote_accepted',
  PROCESSING = 'processing',
  DISPUTED = 'disputed',
}

@Schema({ _id: false })
export class OrderProductSnapshot {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, enum: StoreProductType, required: true })
  type: StoreProductType;

  @Prop({ required: true, min: 0 })
  price: number;

  @Prop({ trim: true })
  image?: string;
}

export const OrderProductSnapshotSchema =
  SchemaFactory.createForClass(OrderProductSnapshot);

@Schema({ _id: false })
export class OrderItem {
  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: OrderProductSnapshotSchema, required: true })
  productSnapshot: OrderProductSnapshot;

  @Prop({ required: true, min: 1 })
  quantity: number;

  @Prop({ required: true, min: 0 })
  unitPrice: number;

  @Prop({ required: true, min: 0, default: 0 })
  discount: number;

  @Prop({ required: true, min: 0 })
  subtotal: number;

  @Prop({ type: MongooseSchema.Types.Mixed })
  customData?: Record<string, unknown>;
}

export const OrderItemSchema = SchemaFactory.createForClass(OrderItem);

@Schema({ _id: false })
export class OrderQuote {
  @Prop({ required: true, min: 0 })
  price: number;

  @Prop({ min: 1 })
  estimatedDays?: number;

  @Prop({ trim: true })
  note?: string;

  @Prop({ type: Date, default: Date.now })
  quotedAt: Date;

  @Prop({ type: Date })
  acceptedAt?: Date;
}

export const OrderQuoteSchema = SchemaFactory.createForClass(OrderQuote);

@Schema({ _id: false })
export class OrderDeliveryFile {
  @Prop({ required: true, trim: true })
  filename: string;

  @Prop({ required: true, trim: true })
  storagePath: string;

  @Prop({ required: true, min: 0 })
  size: number;

  @Prop({ trim: true })
  mimeType?: string;

  @Prop({ type: Date, default: Date.now })
  uploadedAt: Date;
}

export const OrderDeliveryFileSchema =
  SchemaFactory.createForClass(OrderDeliveryFile);

@Schema({ _id: false })
export class OrderStatusHistoryEntry {
  @Prop({ type: String, enum: OrderStatus })
  from?: OrderStatus;

  @Prop({ type: String, enum: OrderStatus, required: true })
  to: OrderStatus;

  @Prop({ trim: true })
  note?: string;

  @Prop({ type: Types.ObjectId })
  changedBy?: Types.ObjectId;

  @Prop({ type: Date, default: Date.now })
  changedAt: Date;
}

export const OrderStatusHistoryEntrySchema = SchemaFactory.createForClass(
  OrderStatusHistoryEntry,
);

@Schema({ _id: false })
export class OrderRefund {
  @Prop({ trim: true, maxlength: 500 })
  reason?: string;

  @Prop({ type: Date })
  requestedAt?: Date;

  @Prop({ type: Types.ObjectId })
  processedBy?: Types.ObjectId;

  @Prop({ type: Date })
  processedAt?: Date;

  @Prop({ min: 0 })
  amount?: number;
}

export const OrderRefundSchema = SchemaFactory.createForClass(OrderRefund);

@Schema({ timestamps: true })
export class Order {
  @Prop({ required: true, unique: true, trim: true })
  orderNumber: string;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  buyerId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  sellerId: Types.ObjectId;

  @Prop({ type: [OrderItemSchema], default: [] })
  items: OrderItem[];

  @Prop({ required: true, min: 0 })
  subtotal: number;

  @Prop({ required: true, min: 0, default: 0 })
  platformFee: number;

  @Prop({ required: true, min: 0 })
  totalAmount: number;

  @Prop({ required: true, min: 0 })
  sellerReceives: number;

  @Prop({ type: Types.ObjectId })
  buyerTransactionId?: Types.ObjectId;

  @Prop({
    type: String,
    enum: OrderStatus,
    default: OrderStatus.PENDING,
    index: true,
  })
  status: OrderStatus;

  @Prop({ type: OrderQuoteSchema })
  quote?: OrderQuote;

  @Prop({ type: [OrderDeliveryFileSchema], default: [] })
  deliveryFiles: OrderDeliveryFile[];

  @Prop({ type: Date })
  deliveredAt?: Date;

  @Prop({ type: Date })
  completedAt?: Date;

  @Prop({ type: Date, index: true })
  autoCompleteAt?: Date;

  @Prop({ type: [OrderStatusHistoryEntrySchema], default: [] })
  statusHistory: OrderStatusHistoryEntry[];

  @Prop({ trim: true, maxlength: 1000 })
  buyerNote?: string;

  @Prop({ trim: true, maxlength: 1000 })
  managerNote?: string;

  @Prop({ trim: true, maxlength: 1000 })
  adminNote?: string;

  @Prop({ trim: true, maxlength: 500 })
  cancelReason?: string;

  @Prop({ type: OrderRefundSchema })
  refund?: OrderRefund;

  createdAt: Date;
  updatedAt: Date;
}

export const OrderSchema = SchemaFactory.createForClass(Order);

OrderSchema.index({ buyerId: 1, status: 1, createdAt: -1 });
OrderSchema.index({ sellerId: 1, status: 1, createdAt: -1 });
OrderSchema.index({ status: 1, autoCompleteAt: 1 });
