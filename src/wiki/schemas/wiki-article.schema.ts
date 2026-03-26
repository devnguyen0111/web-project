import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type WikiArticleDocument = HydratedDocument<WikiArticle>;

export enum WikiArticleStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

export enum WikiRequiredTier {
  PRO = 'pro',
  VIP = 'vip',
}

@Schema({ _id: false })
export class WikiBreadcrumbItem {
  @Prop({ type: Types.ObjectId, required: true })
  articleId: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 200 })
  title: string;

  @Prop({ required: true, trim: true, lowercase: true, maxlength: 200 })
  slug: string;
}

export const WikiBreadcrumbItemSchema =
  SchemaFactory.createForClass(WikiBreadcrumbItem);

@Schema({ _id: false })
export class WikiArticleSnapshot {
  @Prop({ trim: true, maxlength: 200 })
  title?: string;

  @Prop({ trim: true, maxlength: 3000 })
  excerpt?: string;

  @Prop()
  content?: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: Types.ObjectId })
  categoryId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  parentArticleId?: Types.ObjectId;

  @Prop({ default: 0 })
  order: number;

  @Prop({ type: [WikiBreadcrumbItemSchema], default: [] })
  breadcrumb: WikiBreadcrumbItem[];

  @Prop({ enum: WikiArticleStatus })
  status?: WikiArticleStatus;

  @Prop({ default: true })
  isPublic: boolean;

  @Prop({ enum: WikiRequiredTier })
  requiredTier?: WikiRequiredTier;
}

export const WikiArticleSnapshotSchema =
  SchemaFactory.createForClass(WikiArticleSnapshot);

@Schema({ _id: false })
export class WikiArticleChangelogEntry {
  @Prop({ required: true, min: 1 })
  version: number;

  @Prop({ type: Types.ObjectId, required: true })
  editedBy: Types.ObjectId;

  @Prop({ type: Date, required: true })
  editedAt: Date;

  @Prop({ trim: true, maxlength: 1000 })
  summary?: string;

  @Prop({ type: WikiArticleSnapshotSchema })
  snapshot?: WikiArticleSnapshot;
}

export const WikiArticleChangelogEntrySchema = SchemaFactory.createForClass(
  WikiArticleChangelogEntry,
);

@Schema({ timestamps: true })
export class WikiArticle {
  @Prop({ required: true, trim: true, maxlength: 200 })
  title: string;

  @Prop({ required: true, unique: true, trim: true, lowercase: true })
  slug: string;

  @Prop({ required: true })
  content: string;

  @Prop({ trim: true, maxlength: 3000 })
  excerpt?: string;

  @Prop({ type: Types.ObjectId, index: true })
  categoryId?: Types.ObjectId;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: Types.ObjectId, index: true })
  parentArticleId?: Types.ObjectId;

  @Prop({ default: 0 })
  order: number;

  @Prop({ type: [WikiBreadcrumbItemSchema], default: [] })
  breadcrumb: WikiBreadcrumbItem[];

  @Prop({ default: 1, min: 1 })
  version: number;

  @Prop({ type: Types.ObjectId })
  lastEditedBy?: Types.ObjectId;

  @Prop({ type: [WikiArticleChangelogEntrySchema], default: [] })
  changelog: WikiArticleChangelogEntry[];

  @Prop({ default: 0 })
  views: number;

  @Prop({ default: 0 })
  helpfulYes: number;

  @Prop({ default: 0 })
  helpfulNo: number;

  @Prop({ type: String, enum: WikiArticleStatus, default: WikiArticleStatus.DRAFT })
  status: WikiArticleStatus;

  @Prop({ default: true })
  isPublic: boolean;

  @Prop({ type: String, enum: WikiRequiredTier })
  requiredTier?: WikiRequiredTier;

  @Prop({ type: Date })
  publishedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const WikiArticleSchema = SchemaFactory.createForClass(WikiArticle);

WikiArticleSchema.index({ categoryId: 1, order: 1 });
WikiArticleSchema.index({ parentArticleId: 1, order: 1 });
WikiArticleSchema.index({ title: 'text', content: 'text' });
