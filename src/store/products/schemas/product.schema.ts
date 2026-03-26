import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ProductDocument = HydratedDocument<Product>;

export enum ProductType {
  DIGITAL = 'digital',
  CUSTOM_ORDER = 'custom_order',
}

export enum ProductStatus {
  DRAFT = 'draft',
  PENDING_REVIEW = 'pending_review',
  ACTIVE = 'active',
  REJECTED = 'rejected',
  ARCHIVED = 'archived',
}

@Schema({ _id: false })
export class ProductDigitalAsset {
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

  @Prop({ trim: true })
  etag?: string;

  @Prop({ type: Date, required: true })
  uploadedAt: Date;
}

export const ProductDigitalAssetSchema =
  SchemaFactory.createForClass(ProductDigitalAsset);

@Schema({ timestamps: true })
export class Product {
  @Prop({ required: true, trim: true, maxlength: 160 })
  name: string;

  @Prop({
    required: true,
    trim: true,
    lowercase: true,
    maxlength: 180,
    unique: true,
  })
  slug: string;

  @Prop({ trim: true, maxlength: 4000 })
  description?: string;

  @Prop({ type: String, enum: ProductType, default: ProductType.DIGITAL })
  type: ProductType;

  @Prop({ type: String, enum: ProductStatus, default: ProductStatus.DRAFT })
  status: ProductStatus;

  @Prop({ required: true, min: 1 })
  priceAmount: number;

  @Prop({ trim: true, uppercase: true, default: 'VND' })
  currency: string;

  @Prop({ min: 0 })
  stock?: number;

  @Prop({ type: Types.ObjectId, index: true })
  categoryId?: Types.ObjectId;

  @Prop({ type: Boolean, default: false })
  vipOnly: boolean;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  createdBy: Types.ObjectId;

  @Prop({ type: ProductDigitalAssetSchema })
  digitalAsset?: ProductDigitalAsset;

  @Prop({ type: Date })
  submittedAt?: Date;

  @Prop({ type: Types.ObjectId })
  reviewedBy?: Types.ObjectId;

  @Prop({ type: Date })
  reviewedAt?: Date;

  @Prop({ trim: true, maxlength: 1000 })
  rejectionReason?: string;

  createdAt: Date;
  updatedAt: Date;
}

export const ProductSchema = SchemaFactory.createForClass(Product);

ProductSchema.index({ status: 1, type: 1, createdAt: -1 });
ProductSchema.index({ createdBy: 1, createdAt: -1 });
ProductSchema.index({ status: 1, submittedAt: 1 });
ProductSchema.index({ name: 'text', description: 'text' });
ProductSchema.index({ status: 1, categoryId: 1, createdAt: -1 });
ProductSchema.index({ status: 1, vipOnly: 1, createdAt: -1 });
