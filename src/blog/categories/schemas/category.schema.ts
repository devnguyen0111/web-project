import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CategoryDocument = HydratedDocument<Category>;

export enum CategoryScope {
  BLOG = 'blog',
  STORE = 'store',
  WIKI = 'wiki',
  ALL = 'all',
}

@Schema({ timestamps: true })
export class Category {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  slug: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ trim: true })
  icon?: string;

  @Prop({ trim: true })
  color?: string;

  @Prop({ trim: true })
  coverImage?: string;

  @Prop({ type: String, enum: CategoryScope, default: CategoryScope.BLOG })
  scope: CategoryScope;

  @Prop({ type: Types.ObjectId })
  parentId?: Types.ObjectId;

  @Prop({ type: [Types.ObjectId], default: [] })
  ancestors: Types.ObjectId[];

  @Prop({ default: 0 })
  order: number;

  @Prop({ default: 0 })
  postCount: number;

  @Prop({ default: 0 })
  productCount: number;

  @Prop({ default: true })
  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export const CategorySchema = SchemaFactory.createForClass(Category);

CategorySchema.index({ scope: 1, order: 1, isActive: 1 });
CategorySchema.index({ parentId: 1 });
