import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Role } from '../../common/constants/roles.constant';
import {
  Wallet,
  WalletSchema,
  createDefaultWallet,
} from '../../wallet/schemas/wallet.schema';
import {
  Subscription,
  SubscriptionSchema,
  createDefaultSubscription,
} from '../../subscriptions/schemas/subscription.schema';

export type UserDocument = HydratedDocument<User>;

@Schema({ _id: false })
export class UserTwoFactor {
  @Prop({ default: false })
  enabled: boolean;

  @Prop({ select: false })
  secretEncrypted?: string;

  @Prop({ type: [String], default: [], select: false })
  backupCodeHashes: string[];

  @Prop({ type: Date })
  enabledAt?: Date;

  @Prop({ type: Date })
  lastVerifiedAt?: Date;
}

export const UserTwoFactorSchema = SchemaFactory.createForClass(UserTwoFactor);

@Schema({ _id: false })
export class UserGamification {
  @Prop({ default: 0 })
  xp: number;

  @Prop({ default: 1 })
  level: number;

  @Prop({ default: 100 })
  xpToNextLevel: number;

  @Prop({ default: 0 })
  postsPublished: number;

  @Prop({ default: 0 })
  salesCount: number;
}

export const UserGamificationSchema =
  SchemaFactory.createForClass(UserGamification);

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, trim: true })
  fullName: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: 60,
  })
  username: string;

  @Prop({ required: true, minlength: 6, select: false })
  password: string;

  @Prop({ type: String, enum: Role, default: Role.AUTHOR })
  role: Role;

  @Prop({ type: WalletSchema, default: () => createDefaultWallet() })
  wallet: Wallet;

  @Prop({
    type: SubscriptionSchema,
    default: () => createDefaultSubscription(),
  })
  subscription: Subscription;

  @Prop({
    type: UserTwoFactorSchema,
    default: () => ({
      enabled: false,
      backupCodeHashes: [],
    }),
  })
  twoFactor: UserTwoFactor;

  @Prop({ default: false })
  isEmailVerified: boolean;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  avatarUrl?: string;

  @Prop({ default: 0 })
  followersCount: number;

  @Prop({ default: 0 })
  followingCount: number;

  @Prop({
    type: UserGamificationSchema,
    default: () => ({
      xp: 0,
      level: 1,
      xpToNextLevel: 100,
      postsPublished: 0,
      salesCount: 0,
    }),
  })
  gamification: UserGamification;

  @Prop({ select: false })
  refreshToken?: string;

  @Prop({ select: false })
  emailVerificationCodeHash?: string;

  @Prop({ type: Date, select: false })
  emailVerificationCodeExpiresAt?: Date;

  @Prop({ select: false })
  passwordResetCodeHash?: string;

  @Prop({ type: Date, select: false })
  passwordResetCodeExpiresAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
