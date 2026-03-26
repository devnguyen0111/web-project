import { BillingCycle, SubscriptionPlanCode } from './subscription.constants';
import {
  addMonthsSafely,
  calculateSubscriptionQuota,
  normalizeSubscription,
  purchaseSubscriptionPlan,
  renewSubscriptionPlan,
} from './subscription.util';

describe('subscription.util', () => {
  it('normalizes undefined subscription to Free defaults', () => {
    const now = new Date('2026-03-19T00:00:00.000Z');

    const normalized = normalizeSubscription(undefined, now);

    expect(normalized.planCode).toBe(SubscriptionPlanCode.FREE);
    expect(normalized.billingCycle).toBe(BillingCycle.MONTHLY);
    expect(normalized.autoRenew).toBe(false);
    expect(normalized.cancelAtPeriodEnd).toBe(false);
    expect(normalized.nextRenewalAt?.toISOString()).toBe(
      normalized.expiresAt?.toISOString(),
    );
  });

  it('normalizes legacy plan aliases to canonical plan codes', () => {
    const now = new Date('2026-03-19T00:00:00.000Z');

    const normalized = normalizeSubscription(
      {
        planCode: 'starter' as never,
        planName: 'Starter',
        billingCycle: BillingCycle.MONTHLY,
      },
      now,
    );

    expect(normalized.planCode).toBe(SubscriptionPlanCode.PRO);
    expect(normalized.planName).toBe('Pro');
  });

  it('extends current period when purchasing the same active plan', () => {
    const firstPurchaseAt = new Date('2026-01-10T00:00:00.000Z');
    const secondPurchaseAt = new Date('2026-01-15T00:00:00.000Z');
    const existing = purchaseSubscriptionPlan(
      undefined,
      SubscriptionPlanCode.PRO,
      BillingCycle.MONTHLY,
      undefined,
      firstPurchaseAt,
    );

    const renewed = purchaseSubscriptionPlan(
      existing,
      SubscriptionPlanCode.PRO,
      BillingCycle.MONTHLY,
      undefined,
      secondPurchaseAt,
    );

    const expectedExpiry = addMonthsSafely(
      existing.expiresAt ?? firstPurchaseAt,
      1,
    );
    expect(renewed.planCode).toBe(SubscriptionPlanCode.PRO);
    expect(renewed.expiresAt?.toISOString()).toBe(expectedExpiry.toISOString());
  });

  it('renews plan by months and infers billing cycle', () => {
    const now = new Date('2026-03-19T00:00:00.000Z');

    const renewed = renewSubscriptionPlan(
      undefined,
      SubscriptionPlanCode.VIP,
      3,
      now,
    );

    expect(renewed.planCode).toBe(SubscriptionPlanCode.VIP);
    expect(renewed.billingCycle).toBe(BillingCycle.QUARTERLY);
    expect(renewed.expiresAt?.toISOString()).toBe(
      addMonthsSafely(now, 3).toISOString(),
    );
  });

  it('calculates quota with non-negative remaining posts', () => {
    const quota = calculateSubscriptionQuota({
      planCode: SubscriptionPlanCode.FREE,
      postsUsedInPeriod: 999,
    });

    expect(quota.allowedPosts).toBe(5);
    expect(quota.usedPosts).toBe(999);
    expect(quota.remainingPosts).toBe(0);
    expect(quota.exhausted).toBe(true);
  });
});
