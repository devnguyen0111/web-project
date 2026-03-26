import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type WikiCategoryDocument = HydratedDocument<WikiCategory>;

@Schema({ timestamps: true })
export class WikiCategory {
  @Prop({ required: true, trim: true, maxlength: 120 })
  name: string;

  @Prop({ required: true, unique: true, trim: true, lowercase: true, maxlength: 160 })
  slug: string;

  @Prop({ trim: true, maxlength: 1000 })
  description?: string;

  @Prop({ trim: true, maxlength: 120 })
  icon?: string;

  @Prop({ default: 0 })
  order: number;

  @Prop({ type: Types.ObjectId })
  parentId?: Types.ObjectId;

  @Prop({ default: 0 })
  articleCount: number;

  @Prop({ default: true })
  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export const WikiCategorySchema = SchemaFactory.createForClass(WikiCategory);

WikiCategorySchema.index({ order: 1, isActive: 1 });
