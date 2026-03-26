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

export class UserTwoFactorResponseDto {
  enabled: boolean;
  enabledAt?: Date;
  lastVerifiedAt?: Date;
}

export class UserGamificationResponseDto {
  xp: number;
  level: number;
  xpToNextLevel: number;
  postsPublished: number;
  salesCount: number;
}

export class UserResponseDto {
  id: string;
  fullName: string;
  username: string;
  email: string;
  role: Role;
  isEmailVerified: boolean;
  isActive: boolean;
  avatarUrl?: string;
  followersCount: number;
  followingCount: number;
  wallet: WalletResponseDto;
  subscription: UserSubscriptionResponseDto;
  postQuota: UserPostQuotaResponseDto;
  twoFactor: UserTwoFactorResponseDto;
  gamification: UserGamificationResponseDto;
  createdAt: Date;
  updatedAt: Date;
}

export class PublicUserProfileResponseDto {
  id: string;
  fullName: string;
  username: string;
  avatarUrl?: string;
  followersCount: number;
  followingCount: number;
  gamification: UserGamificationResponseDto;
  createdAt: Date;
  updatedAt: Date;
}
