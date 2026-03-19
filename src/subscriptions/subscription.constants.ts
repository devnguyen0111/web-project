export enum SubscriptionPlanCode {
  FREE = 'free',
  PRO = 'pro',
  VIP = 'vip',
}

export enum BillingCycle {
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  YEARLY = 'yearly',
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
}

export const SUBSCRIPTION_BASE_POST_LIMIT = 5;

export type SubscriptionPlanDefinition = {
  code: SubscriptionPlanCode;
  name: string;
  rank: number;
  extraPosts: number;
  monthlyPriceCoins: number;
  perks: {
    rewardBonusPercent: number;
    storeDiscountPercent: number;
    prioritySupport: string;
    exclusiveAccess: string;
    profileBadge: string;
    uploadLimitMb: number;
    featuredProfile: boolean;
    comingSoon: boolean;
  };
};

export const BILLING_CYCLE_MONTHS: Record<BillingCycle, number> = {
  [BillingCycle.MONTHLY]: 1,
  [BillingCycle.QUARTERLY]: 3,
  [BillingCycle.YEARLY]: 12,
};

export const BILLING_CYCLE_DISCOUNT_RATE: Record<BillingCycle, number> = {
  [BillingCycle.MONTHLY]: 0,
  [BillingCycle.QUARTERLY]: 0.1,
  [BillingCycle.YEARLY]: 0.2,
};

export const SUBSCRIPTION_PLAN_DEFINITIONS: Record<
  SubscriptionPlanCode,
  SubscriptionPlanDefinition
> = {
  [SubscriptionPlanCode.FREE]: {
    code: SubscriptionPlanCode.FREE,
    name: 'Free',
    rank: 0,
    extraPosts: 0,
    monthlyPriceCoins: 0,
    perks: {
      rewardBonusPercent: 0,
      storeDiscountPercent: 0,
      prioritySupport: 'Standard',
      exclusiveAccess: 'Public only',
      profileBadge: 'None',
      uploadLimitMb: 10,
      featuredProfile: false,
      comingSoon: false,
    },
  },
  [SubscriptionPlanCode.PRO]: {
    code: SubscriptionPlanCode.PRO,
    name: 'Pro',
    rank: 1,
    extraPosts: 15,
    monthlyPriceCoins: 90,
    perks: {
      rewardBonusPercent: 10,
      storeDiscountPercent: 5,
      prioritySupport: 'Priority',
      exclusiveAccess: 'Pro content',
      profileBadge: 'Pro badge',
      uploadLimitMb: 50,
      featuredProfile: false,
      comingSoon: true,
    },
  },
  [SubscriptionPlanCode.VIP]: {
    code: SubscriptionPlanCode.VIP,
    name: 'VIP',
    rank: 2,
    extraPosts: 35,
    monthlyPriceCoins: 180,
    perks: {
      rewardBonusPercent: 25,
      storeDiscountPercent: 10,
      prioritySupport: 'Highest',
      exclusiveAccess: 'Full exclusive',
      profileBadge: 'VIP badge',
      uploadLimitMb: 200,
      featuredProfile: true,
      comingSoon: true,
    },
  },
};

export const getSubscriptionPlanDefinition = (
  planCode: SubscriptionPlanCode,
): SubscriptionPlanDefinition => {
  return SUBSCRIPTION_PLAN_DEFINITIONS[planCode];
};

export const listSubscriptionPlans = (): SubscriptionPlanDefinition[] => {
  return Object.values(SUBSCRIPTION_PLAN_DEFINITIONS).sort(
    (left, right) => left.rank - right.rank,
  );
};

export const getBillingCycleMonths = (cycle: BillingCycle): number => {
  return BILLING_CYCLE_MONTHS[cycle];
};

export const getBillingCycleDiscountRate = (cycle: BillingCycle): number => {
  return BILLING_CYCLE_DISCOUNT_RATE[cycle];
};

export const calculatePlanPriceByCycle = (
  planCode: SubscriptionPlanCode,
  cycle: BillingCycle,
): {
  monthlyPriceCoins: number;
  cyclePriceCoins: number;
  months: number;
  discountRate: number;
  discountPercent: number;
} => {
  const plan = getSubscriptionPlanDefinition(planCode);
  const months = getBillingCycleMonths(cycle);
  const discountRate = getBillingCycleDiscountRate(cycle);
  const rawPrice = plan.monthlyPriceCoins * months;
  const cyclePriceCoins = Math.round(rawPrice * (1 - discountRate));

  return {
    monthlyPriceCoins: plan.monthlyPriceCoins,
    cyclePriceCoins,
    months,
    discountRate,
    discountPercent: Math.round(discountRate * 100),
  };
};

export const toCanonicalPlanCode = (
  value: string | undefined,
): SubscriptionPlanCode => {
  const normalized = (value ?? '').trim().toLowerCase();
  if (normalized === 'starter' || normalized === 'pro') {
    return SubscriptionPlanCode.PRO;
  }

  if (normalized === 'elite' || normalized === 'vip') {
    return SubscriptionPlanCode.VIP;
  }

  return SubscriptionPlanCode.FREE;
};

export const toCanonicalBillingCycle = (
  value: string | undefined,
): BillingCycle => {
  const normalized = (value ?? '').trim().toLowerCase();
  if (normalized === BillingCycle.QUARTERLY) {
    return BillingCycle.QUARTERLY;
  }
  if (normalized === BillingCycle.YEARLY) {
    return BillingCycle.YEARLY;
  }
  return BillingCycle.MONTHLY;
};
