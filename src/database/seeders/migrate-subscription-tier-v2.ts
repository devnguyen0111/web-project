import mongoose from 'mongoose';
import {
  BillingCycle,
  SubscriptionPlanCode,
  getSubscriptionPlanDefinition,
  toCanonicalPlanCode,
} from '../../subscriptions/subscription.constants';

type AnyDoc = Record<string, unknown>;

const BATCH_SIZE = 500;

function parseApplyFlag(): boolean {
  if (process.argv.includes('--apply')) {
    return true;
  }

  const envValue = process.env.MIGRATION_APPLY?.toLowerCase();
  return envValue === '1' || envValue === 'true' || envValue === 'yes';
}

async function run(): Promise<void> {
  const uri =
    process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/web_project';
  const apply = parseApplyFlag();

  console.log(`[subscription-tier-v2] start apply=${apply} uri=${uri}`);
  if (!apply) {
    console.log(
      '[subscription-tier-v2] dry-run mode. Add --apply or set MIGRATION_APPLY=true to execute writes.',
    );
  }

  await mongoose.connect(uri);

  try {
    const users = mongoose.connection.collection('users');
    const cursor = users.find(
      { subscription: { $exists: true } },
      {
        projection: {
          _id: 1,
          'subscription.planCode': 1,
          'subscription.planName': 1,
          'subscription.startedAt': 1,
          'subscription.expiresAt': 1,
          'subscription.nextRenewalAt': 1,
        },
      },
    );

    let scanned = 0;
    let changed = 0;
    let noChange = 0;
    const ops: AnyDoc[] = [];

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const user = await cursor.next();
      if (!user) {
        break;
      }

      scanned += 1;
      const rawSub = (user as AnyDoc).subscription as AnyDoc | undefined;
      if (!rawSub) {
        noChange += 1;
        continue;
      }

      const oldCode = String(rawSub.planCode ?? 'free');
      const canonical = toCanonicalPlanCode(oldCode);
      const plan = getSubscriptionPlanDefinition(canonical);
      const isPaid = canonical !== SubscriptionPlanCode.FREE;
      const startedAt = rawSub.startedAt
        ? new Date(String(rawSub.startedAt))
        : new Date();
      const expiresAt = rawSub.expiresAt
        ? new Date(String(rawSub.expiresAt))
        : new Date(startedAt);

      const update: AnyDoc = {
        'subscription.planCode': canonical,
        'subscription.planName': plan.name,
        'subscription.extraPosts': plan.extraPosts,
        'subscription.monthlyPriceCoins': plan.monthlyPriceCoins,
        'subscription.billingCycle': BillingCycle.MONTHLY,
        'subscription.autoRenew': isPaid,
        'subscription.cancelAtPeriodEnd': false,
        'subscription.nextRenewalAt': expiresAt,
        'subscription.renewalFailedAt': null,
        'subscription.gracePeriodEndsAt': null,
        'subscription.reminder7dSentAt': null,
        'subscription.reminder3dSentAt': null,
      };

      const currentBillingCycle = String(rawSub.billingCycle ?? '');
      const currentNextRenewalAt = rawSub.nextRenewalAt
        ? new Date(String(rawSub.nextRenewalAt))
        : undefined;
      const unchanged =
        oldCode === canonical &&
        String(rawSub.planName ?? '') === plan.name &&
        Number(rawSub.extraPosts ?? -1) === plan.extraPosts &&
        Number(rawSub.monthlyPriceCoins ?? -1) === plan.monthlyPriceCoins &&
        currentBillingCycle === BillingCycle.MONTHLY &&
        Boolean(rawSub.autoRenew) === isPaid &&
        Boolean(rawSub.cancelAtPeriodEnd) === false &&
        currentNextRenewalAt?.getTime() === expiresAt.getTime();

      if (unchanged) {
        noChange += 1;
        continue;
      }

      changed += 1;
      ops.push({
        updateOne: {
          filter: { _id: (user as AnyDoc)._id },
          update: { $set: update },
        },
      });

      if (ops.length >= BATCH_SIZE) {
        if (apply) {
          await users.bulkWrite(ops as never[]);
        }
        ops.length = 0;
      }
    }

    if (ops.length && apply) {
      await users.bulkWrite(ops as never[]);
    }

    console.log(
      `[subscription-tier-v2] done scanned=${scanned} changed=${changed} unchanged=${noChange} apply=${apply}`,
    );
  } finally {
    await mongoose.disconnect();
  }
}

void run().catch((error: unknown) => {
  console.error('[subscription-tier-v2] failed', error);
  process.exit(1);
});
