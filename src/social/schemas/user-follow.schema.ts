import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UserFollowDocument = HydratedDocument<UserFollow>;

@Schema({ timestamps: true })
export class UserFollow {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  followerId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  followingId: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

export const UserFollowSchema = SchemaFactory.createForClass(UserFollow);

UserFollowSchema.index({ followerId: 1, followingId: 1 }, { unique: true });
UserFollowSchema.index({ followingId: 1, createdAt: -1 });
UserFollowSchema.index({ followerId: 1, createdAt: -1 });
