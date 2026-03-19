import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type TransactionDocument = HydratedDocument<Transaction>;

export enum TransactionType {
  DEPOSIT = 'deposit',
  PURCHASE = 'purchase',
  SUBSCRIPTION = 'subscription',
  SALE_INCOME = 'sale_income',
  POST_REWARD = 'post_reward',
  REFERRAL_BONUS = 'referral_bonus',
  REFUND_BUYER = 'refund_buyer',
  REFUND_STORE = 'refund_store',
  PLATFORM_FEE = 'platform_fee',
  ADMIN_ADJUST = 'admin_adjust',
  WITHDRAWAL = 'withdrawal',
}

export enum TransactionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REVERSED = 'reversed',
}

export enum ExternalPaymentProvider {
  PAYOS = 'payos',
}

@Schema({ _id: false })
export class TransactionReference {
  @Prop({ required: true, lowercase: true, trim: true })
  model: string;

  @Prop({ type: Types.ObjectId, required: true })
  id: Types.ObjectId;
}

export const TransactionReferenceSchema =
  SchemaFactory.createForClass(TransactionReference);

@Schema({ _id: false })
export class ExternalPayment {
  @Prop({ type: String, enum: ExternalPaymentProvider, required: true })
  provider: ExternalPaymentProvider;

  @Prop({ required: true, trim: true })
  externalId: string;

  @Prop({ min: 0 })
  amountReal?: number;

  @Prop({ trim: true, uppercase: true, default: 'VND' })
  currency?: string;

  @Prop({ min: 0 })
  exchangeRate?: number;

  @Prop({ min: 0 })
  orderCode?: number;

  @Prop({ trim: true })
  paymentLinkId?: string;

  @Prop({ trim: true })
  checkoutUrl?: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  providerPayload?: Record<string, unknown>;
}

export const ExternalPaymentSchema =
  SchemaFactory.createForClass(ExternalPayment);

@Schema({ _id: false })
export class TransactionMetadata {
  @Prop({ trim: true })
  requestId?: string;

  @Prop({ trim: true })
  ip?: string;

  @Prop({ trim: true })
  userAgent?: string;

  @Prop({ trim: true })
  fingerprint?: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  providerPayload?: Record<string, unknown>;

  @Prop({ type: MongooseSchema.Types.Mixed })
  fraud?: Record<string, unknown>;
}

export const TransactionMetadataSchema =
  SchemaFactory.createForClass(TransactionMetadata);

@Schema({ timestamps: true })
export class Transaction {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: TransactionType, required: true, index: true })
  type: TransactionType;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ required: true, min: 0 })
  balanceBefore: number;

  @Prop({ required: true, min: 0 })
  balanceAfter: number;

  @Prop({ type: TransactionReferenceSchema })
  reference?: TransactionReference;

  @Prop({ type: Types.ObjectId })
  counterpartyId?: Types.ObjectId;

  @Prop({ type: ExternalPaymentSchema })
  externalPayment?: ExternalPayment;

  @Prop({ type: TransactionMetadataSchema, default: () => ({}) })
  metadata?: TransactionMetadata;

  @Prop({
    type: String,
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
    index: true,
  })
  status: TransactionStatus;

  @Prop({ trim: true, maxlength: 300 })
  description?: string;

  @Prop({ trim: true, maxlength: 1000 })
  note?: string;

  @Prop({ type: Types.ObjectId })
  processedBy?: Types.ObjectId;

  @Prop({ trim: true })
  ip?: string;

  @Prop({ trim: true })
  userAgent?: string;

  @Prop({ default: false })
  flagged: boolean;

  @Prop({ trim: true, maxlength: 500 })
  flagReason?: string;

  @Prop({ type: Date })
  completedAt?: Date;

  @Prop({ type: Date })
  failedAt?: Date;

  @Prop({ trim: true, maxlength: 500 })
  failureReason?: string;

  @Prop({ trim: true })
  idempotencyKey?: string;

  createdAt: Date;
  updatedAt: Date;
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);

TransactionSchema.index({ userId: 1, createdAt: -1 });
TransactionSchema.index({ userId: 1, type: 1, createdAt: -1 });
TransactionSchema.index({ ip: 1, type: 1, status: 1, createdAt: -1 });
TransactionSchema.index({ 'reference.model': 1, 'reference.id': 1 });
TransactionSchema.index(
  {
    'externalPayment.provider': 1,
    'externalPayment.externalId': 1,
  },
  { unique: true, sparse: true },
);
TransactionSchema.index({ flagged: 1, createdAt: -1 });
TransactionSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });
TransactionSchema.index(
  {
    'externalPayment.provider': 1,
    'externalPayment.orderCode': 1,
  },
  { unique: true, sparse: true },
);
