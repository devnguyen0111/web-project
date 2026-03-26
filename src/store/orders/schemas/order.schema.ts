import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { ProductType } from '../../products/schemas/product.schema';

export type OrderDocument = HydratedDocument<Order>;

export enum OrderStatus {
  PENDING = 'pending',
  PAID = 'paid',
  QUOTED = 'quoted',
  QUOTE_ACCEPTED = 'quote_accepted',
  PROCESSING = 'processing',
  DELIVERED = 'delivered',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum OrderSource {
  BUY_NOW = 'buy_now',
  CART = 'cart',
}

@Schema({ _id: false })
export class OrderDigitalAssetSnapshot {
  @Prop({ required: true, trim: true })
  bucketName: string;

  @Prop({ required: true, trim: true })
  objectName: string;

  @Prop({ required: true, trim: true, maxlength: 255 })
  fileName: string;

  @Prop({ trim: true, maxlength: 120 })
  mimeType?: string;

  @Prop({ min: 1 })
  size?: number;
}

export const OrderDigitalAssetSnapshotSchema = SchemaFactory.createForClass(
  OrderDigitalAssetSnapshot,
);

@Schema({ _id: false })
export class OrderItem {
  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 160 })
  productName: string;

  @Prop({ required: true, trim: true, lowercase: true, maxlength: 180 })
  productSlug: string;

  @Prop({ type: String, enum: ProductType, required: true })
  productType: ProductType;

  @Prop({ required: true, min: 0 })
  unitPrice: number;

  @Prop({ required: true, min: 1 })
  quantity: number;

  @Prop({ required: true, min: 0 })
  lineTotal: number;

  @Prop({ trim: true, uppercase: true, default: 'VND' })
  currency: string;

  @Prop({ type: OrderDigitalAssetSnapshotSchema })
  digitalAsset?: OrderDigitalAssetSnapshot;

  @Prop({ type: MongooseSchema.Types.Mixed })
  customData?: Record<string, unknown>;
}

export const OrderItemSchema = SchemaFactory.createForClass(OrderItem);

@Schema({ _id: false })
export class OrderQuote {
  @Prop({ required: true, min: 1 })
  priceAmount: number;

  @Prop({ min: 1 })
  estimatedDays?: number;

  @Prop({ trim: true, maxlength: 1000 })
  note?: string;

  @Prop({ type: Date, required: true })
  quotedAt: Date;

  @Prop({ type: Types.ObjectId, required: true })
  quotedBy: Types.ObjectId;

  @Prop({ type: Date })
  acceptedAt?: Date;
}

export const OrderQuoteSchema = SchemaFactory.createForClass(OrderQuote);

@Schema({ _id: true })
export class OrderDeliveryFile {
  _id?: Types.ObjectId;

  @Prop({ required: true, trim: true })
  bucketName: string;

  @Prop({ required: true, trim: true })
  objectName: string;

  @Prop({ required: true, trim: true, maxlength: 255 })
  fileName: string;

  @Prop({ trim: true, maxlength: 120 })
  mimeType?: string;

  @Prop({ min: 1 })
  size?: number;

  @Prop({ trim: true, maxlength: 120 })
  etag?: string;

  @Prop({ type: Date, required: true })
  uploadedAt: Date;

  @Prop({ type: Types.ObjectId })
  uploadedBy?: Types.ObjectId;

  @Prop({ default: false })
  fromProductAsset: boolean;
}

export const OrderDeliveryFileSchema =
  SchemaFactory.createForClass(OrderDeliveryFile);

export enum OrderDeliveryEmailLogStatus {
  PENDING = 'pending',
  SENT = 'sent',
}

@Schema({ _id: false })
export class OrderDeliveryEmailLog {
  @Prop({ required: true, trim: true })
  fileObjectName: string;

  @Prop({
    type: String,
    enum: OrderDeliveryEmailLogStatus,
    default: OrderDeliveryEmailLogStatus.PENDING,
  })
  status: OrderDeliveryEmailLogStatus;

  @Prop({ type: Date, required: true })
  claimedAt: Date;

  @Prop({ type: Date })
  sentAt?: Date;
}

export const OrderDeliveryEmailLogSchema = SchemaFactory.createForClass(
  OrderDeliveryEmailLog,
);

@Schema({ _id: false })
export class OrderStatusHistoryEntry {
  @Prop({ type: String, enum: OrderStatus, required: true })
  to: OrderStatus;

  @Prop({ type: String, enum: OrderStatus })
  from?: OrderStatus;

  @Prop({ trim: true, maxlength: 500 })
  note?: string;

  @Prop({ type: Types.ObjectId })
  changedBy?: Types.ObjectId;

  @Prop({ type: Date, required: true })
  changedAt: Date;
}

export const OrderStatusHistoryEntrySchema = SchemaFactory.createForClass(
  OrderStatusHistoryEntry,
);

@Schema({ timestamps: true })
export class Order {
  @Prop({ required: true, unique: true, index: true })
  orderNumber: string;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  buyerId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, index: true })
  sellerId?: Types.ObjectId;

  @Prop({ type: [OrderItemSchema], default: [] })
  items: OrderItem[];

  @Prop({ required: true, min: 0 })
  subtotal: number;

  @Prop({ required: true, min: 0, default: 0 })
  discountTotal: number;

  @Prop({ required: true, min: 0 })
  total: number;

  @Prop({ required: true, min: 0, default: 0 })
  platformFee: number;

  @Prop({ required: true, min: 0, default: 0 })
  sellerReceives: number;

  @Prop({ trim: true, uppercase: true, default: 'VND' })
  currency: string;

  @Prop({ type: String, enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;

  @Prop({ type: String, enum: OrderSource, default: OrderSource.BUY_NOW })
  source: OrderSource;

  @Prop({ type: OrderQuoteSchema })
  quote?: OrderQuote;

  @Prop({ type: [OrderDeliveryFileSchema], default: [] })
  deliveryFiles: OrderDeliveryFile[];

  @Prop({ type: [OrderDeliveryEmailLogSchema], default: [] })
  deliveryEmailLogs: OrderDeliveryEmailLog[];

  @Prop({ type: [OrderStatusHistoryEntrySchema], default: [] })
  statusHistory: OrderStatusHistoryEntry[];

  @Prop({ trim: true, maxlength: 128 })
  idempotencyKey?: string;

  @Prop({ type: Types.ObjectId })
  buyerTransactionId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  transactionId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  sellerTransactionId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  platformFeeTransactionId?: Types.ObjectId;

  @Prop({ type: Date })
  paidAt?: Date;

  @Prop({ type: Date })
  deliveredAt?: Date;

  @Prop({ type: Date })
  completedAt?: Date;

  @Prop({ type: Date })
  autoCompleteAt?: Date;

  @Prop({ type: Date })
  settledAt?: Date;

  @Prop({ trim: true, maxlength: 1000 })
  cancelReason?: string;

  createdAt: Date;
  updatedAt: Date;
}

export const OrderSchema = SchemaFactory.createForClass(Order);

OrderSchema.index({ buyerId: 1, createdAt: -1 });
OrderSchema.index({ buyerId: 1, status: 1, createdAt: -1 });
OrderSchema.index({ sellerId: 1, status: 1, createdAt: -1 });
OrderSchema.index({ status: 1, autoCompleteAt: 1 });
OrderSchema.index(
  { buyerId: 1, idempotencyKey: 1 },
  { unique: true, sparse: true },
);
