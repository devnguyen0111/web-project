import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PostDocument = HydratedDocument<Post>;

export enum PostStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  PUBLISHED = 'published',
  REJECTED = 'rejected',
  ARCHIVED = 'archived',
}

export enum PostBlockType {
  PARAGRAPH = 'paragraph',
  HEADING = 'heading',
  QUOTE = 'quote',
  LIST = 'list',
  IMAGE = 'image',
  CODE = 'code',
  DIVIDER = 'divider',
  EMBED = 'embed',
  CALLOUT = 'callout',
  TODO = 'todo',
}

export enum PostListStyle {
  ORDERED = 'ordered',
  UNORDERED = 'unordered',
}

export enum PostImageSize {
  SMALL = 'small',
  MEDIUM = 'medium',
  LARGE = 'large',
}

export enum PostEmbedProvider {
  YOUTUBE = 'youtube',
  TWITTER = 'twitter',
}

export enum PostCalloutTone {
  INFO = 'info',
  SUCCESS = 'success',
  WARNING = 'warning',
  DANGER = 'danger',
}

@Schema({ _id: false })
export class PostTodoItem {
  @Prop({ required: true, trim: true })
  text: string;

  @Prop({ default: false })
  checked: boolean;
}

export const PostTodoItemSchema = SchemaFactory.createForClass(PostTodoItem);

@Schema({ _id: false })
export class PostBlock {
  @Prop({ required: true, enum: PostBlockType })
  type: PostBlockType;

  @Prop({ trim: true })
  id?: string;

  @Prop({ trim: true })
  text?: string;

  @Prop({ min: 1, max: 4 })
  level?: number;

  @Prop({ type: [String], default: undefined })
  items?: string[];

  @Prop({ enum: PostListStyle })
  style?: PostListStyle;

  @Prop({ trim: true })
  url?: string;

  @Prop({ trim: true })
  alt?: string;

  @Prop({ trim: true })
  caption?: string;

  @Prop({ enum: PostImageSize })
  size?: PostImageSize;

  @Prop()
  code?: string;

  @Prop({ trim: true })
  language?: string;

  @Prop({ enum: PostEmbedProvider })
  provider?: PostEmbedProvider;

  @Prop({ trim: true })
  embedUrl?: string;

  @Prop({ enum: PostCalloutTone })
  tone?: PostCalloutTone;

  @Prop({ type: [PostTodoItemSchema], default: undefined })
  todoItems?: PostTodoItem[];
}

export const PostBlockSchema = SchemaFactory.createForClass(PostBlock);

@Schema({ _id: false })
export class PollOption {
  @Prop({ required: true, trim: true })
  text: string;

  @Prop({ default: 0 })
  votes: number;
}

export const PollOptionSchema = SchemaFactory.createForClass(PollOption);

@Schema({ _id: false })
export class Poll {
  @Prop({ required: true, trim: true })
  question: string;

  @Prop({ type: [PollOptionSchema], default: [] })
  options: PollOption[];

  @Prop({ default: 0 })
  totalVotes: number;

  @Prop({ default: true })
  isPermanent: boolean;

  @Prop()
  endsAt?: Date;
}

export const PollSchema = SchemaFactory.createForClass(Poll);

@Schema({ timestamps: true })
export class Post {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  authorId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  slug: string;

  @Prop({ trim: true })
  excerpt?: string;

  @Prop({ trim: true })
  coverImageUrl?: string;

  @Prop({ default: false })
  isExclusive: boolean;

  @Prop({ default: false })
  isFeatured: boolean;

  @Prop({ default: false })
  isPinned: boolean;

  @Prop({ type: [PostBlockSchema], default: [] })
  blocks: PostBlock[];

  @Prop({ default: '' })
  searchText: string;

  @Prop({ trim: true })
  content?: string;

  @Prop({ type: Types.ObjectId })
  categoryId?: Types.ObjectId;

  @Prop({ type: [Types.ObjectId], default: [] })
  tags: Types.ObjectId[];

  @Prop({ type: String, enum: PostStatus, default: PostStatus.DRAFT })
  status: PostStatus;

  @Prop()
  submittedAt?: Date;

  @Prop({ type: Types.ObjectId })
  reviewedBy?: Types.ObjectId;

  @Prop()
  reviewedAt?: Date;

  @Prop()
  rejectionReason?: string;

  @Prop({ default: 0 })
  views: number;

  @Prop({ type: [Types.ObjectId], default: [] })
  likes: Types.ObjectId[];

  @Prop({ default: 0 })
  likesCount: number;

  @Prop({ type: [Types.ObjectId], default: [] })
  bookmarks: Types.ObjectId[];

  @Prop({ default: 0 })
  bookmarksCount: number;

  @Prop({ default: 0 })
  commentsCount: number;

  @Prop({ type: PollSchema })
  poll?: Poll;

  @Prop()
  publishedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const PostSchema = SchemaFactory.createForClass(Post);

PostSchema.index({ authorId: 1, status: 1 });
PostSchema.index({ status: 1, publishedAt: -1 });
PostSchema.index({ status: 1, isPinned: -1, isFeatured: -1, publishedAt: -1 });
PostSchema.index({ categoryId: 1, status: 1 });
PostSchema.index({ tags: 1 });
PostSchema.index({ title: 'text', searchText: 'text' });
