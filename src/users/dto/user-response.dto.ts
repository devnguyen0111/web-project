import { Role } from '../../common/constants/roles.constant';
import {
  BillingCycle,
  SubscriptionPlanCode,
  SubscriptionStatus,
} from '../../subscriptions/subscription.constants';

export class WalletResponseDto {
  balance: number;
  frozenBalance: number;
  totalEarned: number;
  totalSpent: number;
  lifetimeDeposit: number;
}

export class UserSubscriptionResponseDto {
  planCode: SubscriptionPlanCode;
  planName: string;
  basePostLimit: number;
  extraPosts: number;
  monthlyPriceCoins: number;
  billingCycle: BillingCycle;
  autoRenew: boolean;
  cancelAtPeriodEnd: boolean;
  status: SubscriptionStatus;
  startedAt: Date;
  expiresAt?: Date;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  postsUsedInPeriod: number;
  renewedAt: Date;
  nextRenewalAt?: Date;
  renewalFailedAt?: Date;
  gracePeriodEndsAt?: Date;
  reminder7dSentAt?: Date;
  reminder3dSentAt?: Date;
}

export class UserPostQuotaResponseDto {
  allowedPosts: number;
  usedPosts: number;
  remainingPosts: number;
  exhausted: boolean;
}

export class UserResponseDto {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  isEmailVerified: boolean;
  isActive: boolean;
  avatarUrl?: string;
  wallet: WalletResponseDto;
  subscription: UserSubscriptionResponseDto;
  postQuota: UserPostQuotaResponseDto;
  createdAt: Date;
  updatedAt: Date;
}
