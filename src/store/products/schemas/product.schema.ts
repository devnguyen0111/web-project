import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type ProductDocument = HydratedDocument<Product>;

export enum ProductType {
  DIGITAL = 'digital',
  CUSTOM_ORDER = 'custom_order',
}

export enum ProductStatus {
  DRAFT = 'draft',
  PENDING_REVIEW = 'pending_review',
  ACTIVE = 'active',
  PAUSED = 'paused',
  REJECTED = 'rejected',
  ARCHIVED = 'archived',
}

export enum ProductCustomFieldType {
  TEXT = 'text',
  TEXTAREA = 'textarea',
  NUMBER = 'number',
  SELECT = 'select',
  CHECKBOX = 'checkbox',
  RADIO = 'radio',
  DATE = 'date',
}

@Schema({ _id: false })
export class ProductImage {
  @Prop({ required: true, trim: true })
  url: string;

  @Prop({ trim: true })
  alt?: string;

  @Prop({ default: 0 })
  order: number;
}

export const ProductImageSchema = SchemaFactory.createForClass(ProductImage);

@Schema({ _id: false })
export class ProductFile {
  @Prop({ required: true, trim: true })
  filename: string;

  @Prop({ required: true, trim: true })
  storagePath: string;

  @Prop({ required: true, min: 0 })
  size: number;

  @Prop({ required: true, trim: true })
  mimeType: string;

  @Prop({ default: 1, min: 1 })
  version: number;

  @Prop({ type: Date, default: () => new Date() })
  uploadedAt: Date;
}

export const ProductFileSchema = SchemaFactory.createForClass(ProductFile);

@Schema({ _id: false })
export class ProductEstimatedDays {
  @Prop({ min: 0 })
  min?: number;

  @Prop({ min: 0 })
  max?: number;
}

export const ProductEstimatedDaysSchema =
  SchemaFactory.createForClass(ProductEstimatedDays);

@Schema({ _id: false })
export class ProductSubscriberDiscount {
  @Prop({ default: 0, min: 0 })
  pro: number;

  @Prop({ default: 0, min: 0 })
  vip: number;
}

export const ProductSubscriberDiscountSchema = SchemaFactory.createForClass(
  ProductSubscriberDiscount,
);

@Schema({ _id: false })
export class ProductCustomField {
  @Prop({ required: true, trim: true, maxlength: 100 })
  label: string;

  @Prop({ required: true, enum: ProductCustomFieldType })
  type: ProductCustomFieldType;

  @Prop({ type: [String], default: [] })
  options: string[];

  @Prop({ default: false })
  required: boolean;

  @Prop({ trim: true, maxlength: 200 })
  placeholder?: string;
}

export const ProductCustomFieldSchema = SchemaFactory.createForClass(
  ProductCustomField,
);

@Schema({ timestamps: true })
export class Product {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  sellerId: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 200 })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  slug: string;

  @Prop({ trim: true, maxlength: 500 })
  shortDescription?: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ type: [ProductImageSchema], default: [] })
  images: ProductImage[];

  @Prop({ trim: true })
  previewUrl?: string;

  @Prop({ type: String, enum: ProductType, default: ProductType.DIGITAL })
  type: ProductType;

  @Prop({ type: [ProductFileSchema], default: [] })
  files: ProductFile[];

  @Prop({ type: [ProductCustomFieldSchema], default: [] })
  customFields?: ProductCustomField[];

  @Prop({ type: ProductEstimatedDaysSchema })
  estimatedDays?: ProductEstimatedDays;

  @Prop({ required: true, min: 0 })
  price: number;

  @Prop({ min: 0 })
  originalPrice?: number;

  @Prop({ default: false })
  isOnSale: boolean;

  @Prop({ type: Date })
  saleEndsAt?: Date;

  @Prop({ type: Types.ObjectId, index: true })
  categoryId?: Types.ObjectId;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ default: 0, min: 0 })
  salesCount: number;

  @Prop({ default: 0, min: 0 })
  rating: number;

  @Prop({ default: 0, min: 0 })
  reviewsCount: number;

  @Prop({ default: 0, min: 0 })
  viewsCount: number;

  @Prop({ default: 0, min: 0 })
  favoritesCount: number;

  @Prop({
    type: String,
    enum: ProductStatus,
    default: ProductStatus.DRAFT,
    index: true,
  })
  status: ProductStatus;

  @Prop({ type: Types.ObjectId, index: true })
  reviewedBy?: Types.ObjectId;

  @Prop({ trim: true, maxlength: 500 })
  rejectionReason?: string;

  @Prop({ default: 0, min: 0 })
  stock: number;

  @Prop({ default: 1, min: 1 })
  maxPerUser: number;

  @Prop({ default: false })
  isFeatured: boolean;

  @Prop({ type: ProductSubscriberDiscountSchema, default: () => ({}) })
  subscriberDiscount: ProductSubscriberDiscount;

  createdAt: Date;
  updatedAt: Date;
}

export const ProductSchema = SchemaFactory.createForClass(Product);

ProductSchema.index({ sellerId: 1, status: 1 });
ProductSchema.index({ status: 1, categoryId: 1 });
ProductSchema.index({ type: 1, status: 1 });
ProductSchema.index({ rating: -1, salesCount: -1 });
ProductSchema.index({
  name: 'text',
  shortDescription: 'text',
  description: 'text',
});
