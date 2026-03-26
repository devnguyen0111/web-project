import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type WikiArticleVoteDocument = HydratedDocument<WikiArticleVote>;

export enum WikiHelpfulVote {
  YES = 'yes',
  NO = 'no',
}

@Schema({ timestamps: true })
export class WikiArticleVote {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  articleId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: WikiHelpfulVote, required: true })
  value: WikiHelpfulVote;

  createdAt: Date;
  updatedAt: Date;
}

export const WikiArticleVoteSchema =
  SchemaFactory.createForClass(WikiArticleVote);

WikiArticleVoteSchema.index({ articleId: 1, userId: 1 }, { unique: true });

