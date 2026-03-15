import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CommentDocument = HydratedDocument<Comment>;

@Schema({ timestamps: true })
export class Comment {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  postId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  authorId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  content: string;

  @Prop({ type: Types.ObjectId, index: true })
  parentId?: Types.ObjectId;

  @Prop({ default: 1, min: 1, max: 3 })
  depth: number;

  @Prop({ type: [Types.ObjectId], default: [] })
  likes: Types.ObjectId[];

  @Prop({ default: 0 })
  likesCount: number;

  @Prop({ default: false })
  isEdited: boolean;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ default: false })
  isHidden: boolean;

  @Prop({ type: Types.ObjectId })
  hiddenBy?: Types.ObjectId;

  @Prop()
  hideReason?: string;

  createdAt: Date;
  updatedAt: Date;
}

export const CommentSchema = SchemaFactory.createForClass(Comment);

CommentSchema.index({ postId: 1, createdAt: 1 });
