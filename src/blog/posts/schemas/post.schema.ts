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

  @Prop({ required: true })
  content: string;

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
PostSchema.index({ categoryId: 1, status: 1 });
PostSchema.index({ tags: 1 });
PostSchema.index({ title: 'text', content: 'text' });
