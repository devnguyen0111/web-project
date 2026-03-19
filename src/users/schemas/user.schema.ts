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

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, trim: true })
  fullName: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

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

  @Prop({ default: false })
  isEmailVerified: boolean;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  avatarUrl?: string;

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
