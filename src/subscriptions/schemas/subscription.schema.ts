import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  BillingCycle,
  SUBSCRIPTION_BASE_POST_LIMIT,
  SubscriptionPlanCode,
  SubscriptionStatus,
  getBillingCycleMonths,
  getSubscriptionPlanDefinition,
  toCanonicalPlanCode,
} from '../subscription.constants';

export type SubscriptionDocument = HydratedDocument<Subscription>;

@Schema({ _id: false })
export class Subscription {
  @Prop({ type: String, enum: SubscriptionPlanCode, required: true })
  planCode: SubscriptionPlanCode;

  @Prop({ required: true, trim: true, maxlength: 80 })
  planName: string;

  @Prop({ required: true, min: 0, default: SUBSCRIPTION_BASE_POST_LIMIT })
  basePostLimit: number;

  @Prop({ required: true, min: 0, default: 0 })
  extraPosts: number;

  @Prop({ required: true, min: 0, default: 0 })
  monthlyPriceCoins: number;

  @Prop({
    type: String,
    enum: BillingCycle,
    default: BillingCycle.MONTHLY,
  })
  billingCycle: BillingCycle;

  @Prop({ default: true })
  autoRenew: boolean;

  @Prop({ default: false })
  cancelAtPeriodEnd: boolean;

  @Prop({
    type: String,
    enum: SubscriptionStatus,
    default: SubscriptionStatus.ACTIVE,
  })
  status: SubscriptionStatus;

  @Prop({ required: true, default: () => new Date() })
  startedAt: Date;

  @Prop()
  expiresAt?: Date;

  @Prop({ required: true, default: () => new Date() })
  currentPeriodStart: Date;

  @Prop({ required: true, default: () => new Date() })
  currentPeriodEnd: Date;

  @Prop({ min: 0, default: 0 })
  postsUsedInPeriod: number;

  @Prop({ default: () => new Date() })
  renewedAt: Date;

  @Prop()
  nextRenewalAt?: Date;

  @Prop()
  renewalFailedAt?: Date;

  @Prop()
  gracePeriodEndsAt?: Date;

  @Prop()
  reminder7dSentAt?: Date;

  @Prop()
  reminder3dSentAt?: Date;
}

export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);

const addMonths = (date: Date, months: number): Date => {
  const normalizedMonths = Math.max(Math.floor(months), 0);
  const result = new Date(date);
  const dayOfMonth = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + normalizedMonths);
  const lastDay = new Date(
    result.getFullYear(),
    result.getMonth() + 1,
    0,
  ).getDate();
  result.setDate(Math.min(dayOfMonth, lastDay));
  return result;
};

export const createDefaultSubscription = (now = new Date()): Subscription => {
  const plan = getSubscriptionPlanDefinition(SubscriptionPlanCode.FREE);
  const currentPeriodStart = new Date(now);
  const currentPeriodEnd = addMonths(currentPeriodStart, 1);
  const billingCycle = BillingCycle.MONTHLY;
  const expiresAt = addMonths(
    currentPeriodStart,
    getBillingCycleMonths(billingCycle),
  );

  return {
    planCode: plan.code,
    planName: plan.name,
    basePostLimit: SUBSCRIPTION_BASE_POST_LIMIT,
    extraPosts: plan.extraPosts,
    monthlyPriceCoins: plan.monthlyPriceCoins,
    billingCycle,
    autoRenew: false,
    cancelAtPeriodEnd: false,
    status: SubscriptionStatus.ACTIVE,
    startedAt: currentPeriodStart,
    expiresAt,
    currentPeriodStart,
    currentPeriodEnd,
    postsUsedInPeriod: 0,
    renewedAt: currentPeriodStart,
    nextRenewalAt: expiresAt,
    renewalFailedAt: undefined,
    gracePeriodEndsAt: undefined,
    reminder7dSentAt: undefined,
    reminder3dSentAt: undefined,
  };
};

export const normalizeSubscriptionLegacyCodes = (
  rawSubscription: Partial<Subscription> | undefined,
): Partial<Subscription> | undefined => {
  if (!rawSubscription) {
    return rawSubscription;
  }

  const canonicalPlanCode = toCanonicalPlanCode(
    rawSubscription.planCode as string | undefined,
  );

  return {
    ...rawSubscription,
    planCode: canonicalPlanCode,
  };
};
