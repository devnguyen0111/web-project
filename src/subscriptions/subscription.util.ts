import {
  BillingCycle,
  SUBSCRIPTION_BASE_POST_LIMIT,
  SubscriptionPlanCode,
  SubscriptionStatus,
  getBillingCycleMonths,
  getSubscriptionPlanDefinition,
  toCanonicalBillingCycle,
  toCanonicalPlanCode,
} from './subscription.constants';
import {
  Subscription,
  createDefaultSubscription,
  normalizeSubscriptionLegacyCodes,
} from './schemas/subscription.schema';

export type SubscriptionQuota = {
  allowedPosts: number;
  usedPosts: number;
  remainingPosts: number;
  exhausted: boolean;
};

export const addMonthsSafely = (date: Date, months: number): Date => {
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

export const addDaysSafely = (date: Date, days: number): Date => {
  const normalizedDays = Math.max(Math.floor(days), 0);
  const result = new Date(date);
  result.setDate(result.getDate() + normalizedDays);
  return result;
};

export const toLegacyMonthsCycle = (months: number): BillingCycle => {
  if (months >= 12) {
    return BillingCycle.YEARLY;
  }

  if (months >= 3) {
    return BillingCycle.QUARTERLY;
  }

  return BillingCycle.MONTHLY;
};

export const normalizeSubscription = (
  rawSubscription: Partial<Subscription> | undefined,
  now = new Date(),
): Subscription => {
  const fallback = createDefaultSubscription(now);
  if (!rawSubscription) {
    return fallback;
  }

  const normalizedInput = normalizeSubscriptionLegacyCodes(rawSubscription);
  const fallbackPlan = getSubscriptionPlanDefinition(SubscriptionPlanCode.FREE);
  const planCode = toCanonicalPlanCode(
    normalizedInput?.planCode as string | undefined,
  );
  const plan = getSubscriptionPlanDefinition(planCode) ?? fallbackPlan;
  const billingCycle = toCanonicalBillingCycle(
    normalizedInput?.billingCycle as string | undefined,
  );
  const isPaidPlan = planCode !== SubscriptionPlanCode.FREE;
  const defaultExpiresAt = addMonthsSafely(
    now,
    getBillingCycleMonths(billingCycle),
  );

  const normalized: Subscription = {
    planCode,
    planName: normalizedInput?.planName ?? plan.name,
    basePostLimit:
      normalizedInput?.basePostLimit ?? SUBSCRIPTION_BASE_POST_LIMIT,
    extraPosts: normalizedInput?.extraPosts ?? plan.extraPosts,
    monthlyPriceCoins:
      normalizedInput?.monthlyPriceCoins ?? plan.monthlyPriceCoins,
    billingCycle,
    autoRenew:
      normalizedInput?.autoRenew ??
      (isPaidPlan ? true : (fallback.autoRenew ?? false)),
    cancelAtPeriodEnd: normalizedInput?.cancelAtPeriodEnd ?? false,
    status: normalizedInput?.status ?? SubscriptionStatus.ACTIVE,
    startedAt: normalizedInput?.startedAt
      ? new Date(normalizedInput.startedAt)
      : fallback.startedAt,
    expiresAt: normalizedInput?.expiresAt
      ? new Date(normalizedInput.expiresAt)
      : defaultExpiresAt,
    currentPeriodStart: normalizedInput?.currentPeriodStart
      ? new Date(normalizedInput.currentPeriodStart)
      : fallback.currentPeriodStart,
    currentPeriodEnd: normalizedInput?.currentPeriodEnd
      ? new Date(normalizedInput.currentPeriodEnd)
      : fallback.currentPeriodEnd,
    postsUsedInPeriod: Math.max(normalizedInput?.postsUsedInPeriod ?? 0, 0),
    renewedAt: normalizedInput?.renewedAt
      ? new Date(normalizedInput.renewedAt)
      : fallback.renewedAt,
    nextRenewalAt: normalizedInput?.nextRenewalAt
      ? new Date(normalizedInput.nextRenewalAt)
      : undefined,
    renewalFailedAt: normalizedInput?.renewalFailedAt
      ? new Date(normalizedInput.renewalFailedAt)
      : undefined,
    gracePeriodEndsAt: normalizedInput?.gracePeriodEndsAt
      ? new Date(normalizedInput.gracePeriodEndsAt)
      : undefined,
    reminder7dSentAt: normalizedInput?.reminder7dSentAt
      ? new Date(normalizedInput.reminder7dSentAt)
      : undefined,
    reminder3dSentAt: normalizedInput?.reminder3dSentAt
      ? new Date(normalizedInput.reminder3dSentAt)
      : undefined,
  };

  if (normalized.currentPeriodEnd <= normalized.currentPeriodStart) {
    normalized.currentPeriodEnd = addMonthsSafely(
      normalized.currentPeriodStart,
      1,
    );
    normalized.postsUsedInPeriod = 0;
  }

  while (now >= normalized.currentPeriodEnd) {
    normalized.currentPeriodStart = new Date(normalized.currentPeriodEnd);
    normalized.currentPeriodEnd = addMonthsSafely(
      normalized.currentPeriodEnd,
      1,
    );
    normalized.postsUsedInPeriod = 0;
  }

  if (normalized.planCode === SubscriptionPlanCode.FREE) {
    normalized.status = SubscriptionStatus.ACTIVE;
    normalized.billingCycle = BillingCycle.MONTHLY;
    normalized.autoRenew = false;
    normalized.cancelAtPeriodEnd = false;
    normalized.expiresAt = normalized.currentPeriodEnd;
    normalized.nextRenewalAt = normalized.currentPeriodEnd;
    normalized.renewalFailedAt = undefined;
    normalized.gracePeriodEndsAt = undefined;
    normalized.reminder7dSentAt = undefined;
    normalized.reminder3dSentAt = undefined;
  } else {
    if (!normalized.expiresAt) {
      normalized.expiresAt = addMonthsSafely(
        normalized.startedAt,
        getBillingCycleMonths(normalized.billingCycle),
      );
    }

    if (
      normalized.gracePeriodEndsAt &&
      now >= normalized.gracePeriodEndsAt &&
      now >= normalized.expiresAt
    ) {
      return createDefaultSubscription(now);
    }

    if (
      now >= normalized.expiresAt &&
      (!normalized.gracePeriodEndsAt || now >= normalized.gracePeriodEndsAt)
    ) {
      return createDefaultSubscription(now);
    }
  }

  normalized.planName = plan.name;
  normalized.extraPosts = plan.extraPosts;
  normalized.monthlyPriceCoins = plan.monthlyPriceCoins;
  normalized.basePostLimit = SUBSCRIPTION_BASE_POST_LIMIT;
  normalized.nextRenewalAt = normalized.expiresAt;

  return normalized;
};

export const calculateSubscriptionQuota = (
  subscription: Partial<Subscription> | undefined,
): SubscriptionQuota => {
  const normalized = normalizeSubscription(subscription);
  const allowedPosts = Math.max(
    normalized.basePostLimit + normalized.extraPosts,
    0,
  );
  const usedPosts = Math.max(normalized.postsUsedInPeriod ?? 0, 0);
  const remainingPosts = Math.max(allowedPosts - usedPosts, 0);

  return {
    allowedPosts,
    usedPosts,
    remainingPosts,
    exhausted: remainingPosts <= 0,
  };
};

export const purchaseSubscriptionPlan = (
  subscription: Partial<Subscription> | undefined,
  planCode: SubscriptionPlanCode,
  billingCycle: BillingCycle,
  monthsOverride: number | undefined,
  now = new Date(),
): Subscription => {
  const normalized = normalizeSubscription(subscription, now);
  const canonicalPlanCode = toCanonicalPlanCode(planCode);
  const requestedPlan = getSubscriptionPlanDefinition(canonicalPlanCode);
  const normalizedMonths = monthsOverride
    ? Math.max(Math.floor(monthsOverride), 1)
    : getBillingCycleMonths(billingCycle);

  const extendedFrom =
    normalized.planCode === canonicalPlanCode &&
    normalized.expiresAt &&
    normalized.expiresAt > now
      ? normalized.expiresAt
      : now;
  const newExpiresAt = addMonthsSafely(extendedFrom, normalizedMonths);
  const paidPlan = canonicalPlanCode !== SubscriptionPlanCode.FREE;
  const nextStartedAt =
    normalized.planCode === canonicalPlanCode
      ? normalized.startedAt
      : new Date(now);

  return {
    ...normalized,
    planCode: requestedPlan.code,
    planName: requestedPlan.name,
    extraPosts: requestedPlan.extraPosts,
    monthlyPriceCoins: requestedPlan.monthlyPriceCoins,
    billingCycle,
    basePostLimit: SUBSCRIPTION_BASE_POST_LIMIT,
    status: SubscriptionStatus.ACTIVE,
    autoRenew: paidPlan ? (normalized.autoRenew ?? true) : false,
    cancelAtPeriodEnd: false,
    startedAt: nextStartedAt,
    expiresAt: newExpiresAt,
    renewedAt: new Date(now),
    nextRenewalAt: newExpiresAt,
    renewalFailedAt: undefined,
    gracePeriodEndsAt: undefined,
    reminder7dSentAt: undefined,
    reminder3dSentAt: undefined,
  };
};

export const renewSubscriptionPlan = (
  subscription: Partial<Subscription> | undefined,
  planCode: SubscriptionPlanCode,
  months: number,
  now = new Date(),
): Subscription => {
  const cycle = toLegacyMonthsCycle(months);
  return purchaseSubscriptionPlan(subscription, planCode, cycle, months, now);
};

export const markReminderSent = (
  subscription: Partial<Subscription> | undefined,
  reminderDays: 7 | 3,
  now = new Date(),
): Subscription => {
  const normalized = normalizeSubscription(subscription, now);

  if (reminderDays === 7) {
    normalized.reminder7dSentAt = new Date(now);
    return normalized;
  }

  normalized.reminder3dSentAt = new Date(now);
  return normalized;
};

export const markRenewalFailed = (
  subscription: Partial<Subscription> | undefined,
  now = new Date(),
  graceDays = 3,
): Subscription => {
  const normalized = normalizeSubscription(subscription, now);
  normalized.renewalFailedAt = new Date(now);
  normalized.gracePeriodEndsAt = addDaysSafely(now, graceDays);
  normalized.status = SubscriptionStatus.ACTIVE;

  return normalized;
};

export const shouldSendReminder = (
  subscription: Partial<Subscription> | undefined,
  now: Date,
  reminderDays: 7 | 3,
): boolean => {
  const normalized = normalizeSubscription(subscription, now);

  if (
    normalized.planCode === SubscriptionPlanCode.FREE ||
    !normalized.expiresAt
  ) {
    return false;
  }

  const msUntilExpiry = normalized.expiresAt.getTime() - now.getTime();
  if (msUntilExpiry < 0) {
    return false;
  }

  const daysUntilExpiry = msUntilExpiry / (24 * 60 * 60 * 1000);
  if (reminderDays === 7) {
    return (
      daysUntilExpiry <= 7 &&
      daysUntilExpiry > 3 &&
      !normalized.reminder7dSentAt
    );
  }

  return daysUntilExpiry <= 3 && !normalized.reminder3dSentAt;
};
