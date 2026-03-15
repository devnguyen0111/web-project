import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PollVoteDocument = HydratedDocument<PollVote>;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class PollVote {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  postId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  optionIndex: number;

  createdAt: Date;
}

export const PollVoteSchema = SchemaFactory.createForClass(PollVote);

PollVoteSchema.index({ postId: 1, userId: 1 }, { unique: true });
