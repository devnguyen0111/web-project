import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type LeaderboardSnapshotDocument = HydratedDocument<LeaderboardSnapshot>;

export enum LeaderboardPeriod {
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  ALLTIME = 'alltime',
}

@Schema({ _id: false })
export class LeaderboardEntry {
  @Prop({ type: Types.ObjectId, required: true })
  userId: Types.ObjectId;

  @Prop({ required: true, min: 1 })
  rank: number;

  @Prop({ required: true, min: 0 })
  xp: number;

  @Prop({ required: true, min: 1 })
  level: number;

  @Prop({ required: true, min: 0 })
  postsPublished: number;

  @Prop({ required: true, min: 0 })
  salesCount: number;
}

export const LeaderboardEntrySchema =
  SchemaFactory.createForClass(LeaderboardEntry);

@Schema({ timestamps: true })
export class LeaderboardSnapshot {
  @Prop({ type: String, enum: LeaderboardPeriod, required: true, index: true })
  period: LeaderboardPeriod;

  @Prop({ required: true, trim: true, index: true })
  periodKey: string;

  @Prop({ type: [LeaderboardEntrySchema], default: [] })
  entries: LeaderboardEntry[];

  @Prop({ type: Date, required: true })
  generatedAt: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const LeaderboardSnapshotSchema =
  SchemaFactory.createForClass(LeaderboardSnapshot);

LeaderboardSnapshotSchema.index({ period: 1, periodKey: 1 }, { unique: true });
