import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ProductDocument = HydratedDocument<Product>;

export enum ProductType {
  DIGITAL = 'digital',
  CUSTOM_ORDER = 'custom_order',
}

export enum ProductStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

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

  @Prop({ type: Types.ObjectId, required: true, index: true })
  createdBy: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

export const ProductSchema = SchemaFactory.createForClass(Product);

ProductSchema.index({ status: 1, type: 1, createdAt: -1 });
ProductSchema.index({ createdBy: 1, createdAt: -1 });
ProductSchema.index({ name: 'text', description: 'text' });
