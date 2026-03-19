import fs from 'node:fs';
import path from 'node:path';
import mongoose, { Types } from 'mongoose';

type TargetTransactionType = 'subscription' | 'post_reward';

type LegacyTransaction = {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  type: TargetTransactionType;
  amount: number;
};

type MigrationCandidate = {
  id: Types.ObjectId;
  userId: string;
  type: TargetTransactionType;
  originalAmount: number;
  correctedAmount: number;
  difference: number;
};

type UserWalletDelta = {
  balanceDelta: number;
  totalSpentDelta: number;
  totalEarnedDelta: number;
};

type MigrationStats = {
  scanned: number;
  candidates: number;
  alreadyNormalized: number;
  skippedInvalidAmount: number;
  subscriptionCandidates: number;
  postRewardCandidates: number;
};

const MIGRATION_NAME = 'wallet-unit-normalization-v1';
const DEFAULT_MONGO_URI = 'mongodb://127.0.0.1:27017/web_project';
const DEFAULT_COIN_TO_VND_RATE = 1000;
const TARGET_TYPES: TargetTransactionType[] = ['subscription', 'post_reward'];

function parseBooleanFlag(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return ['1', 'true', 'yes', 'y'].includes(value.trim().toLowerCase());
}

function readEnvFileValue(key: string): string | undefined {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    return undefined;
  }

  const content = fs.readFileSync(envPath, 'utf8');
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const envKey = trimmed.slice(0, separatorIndex).trim();
    if (envKey !== key) {
      continue;
    }

    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const normalizedValue = rawValue.replace(/^"(.*)"$/, '$1').trim();
    if (normalizedValue) {
      return normalizedValue;
    }
  }

  return undefined;
}

function getMongoUri(): string {
  return (
    process.env.MONGODB_URI ??
    readEnvFileValue('MONGODB_URI') ??
    DEFAULT_MONGO_URI
  );
}

function getCoinToVndRate(cliRate: number | undefined): number {
  if (cliRate && Number.isFinite(cliRate) && cliRate > 0) {
    return Math.floor(cliRate);
  }

  const envRate =
    process.env.COIN_TO_VND_RATE ?? readEnvFileValue('COIN_TO_VND_RATE');
  if (!envRate) {
    return DEFAULT_COIN_TO_VND_RATE;
  }

  const parsed = Number(envRate);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_COIN_TO_VND_RATE;
  }

  return Math.floor(parsed);
}

function parseCliArgs(): {
  apply: boolean;
  rate?: number;
  userId?: string;
} {
  const args = process.argv.slice(2);
  let apply = false;
  let rate: number | undefined;
  let userId: string | undefined;

  for (const arg of args) {
    if (arg === '--apply') {
      apply = true;
      continue;
    }

    if (arg.startsWith('--rate=')) {
      const raw = arg.slice('--rate='.length);
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed > 0) {
        rate = parsed;
      }
      continue;
    }

    if (arg.startsWith('--userId=')) {
      const raw = arg.slice('--userId='.length).trim();
      if (raw) {
        userId = raw;
      }
    }
  }

  if (parseBooleanFlag(process.env.MIGRATION_APPLY)) {
    apply = true;
  }

  return { apply, rate, userId };
}

function ensureSafeIntegerAmount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('amount must be positive');
  }

  if (!Number.isSafeInteger(value)) {
    throw new Error('amount must be a safe integer');
  }

  return value;
}

function buildMigrationCandidate(
  tx: LegacyTransaction,
  coinToVndRate: number,
): MigrationCandidate | null {
  const originalAmount = ensureSafeIntegerAmount(tx.amount);

  if (originalAmount % coinToVndRate === 0) {
    return null;
  }

  const correctedAmount = ensureSafeIntegerAmount(originalAmount * coinToVndRate);
  const difference = correctedAmount - originalAmount;

  if (difference <= 0) {
    return null;
  }

  return {
    id: tx._id,
    userId: tx.userId.toString(),
    type: tx.type,
    originalAmount,
    correctedAmount,
    difference,
  };
}

function applyDelta(
  current: UserWalletDelta | undefined,
  candidate: MigrationCandidate,
): UserWalletDelta {
  const next = current ?? {
    balanceDelta: 0,
    totalSpentDelta: 0,
    totalEarnedDelta: 0,
  };

  if (candidate.type === 'subscription') {
    next.balanceDelta -= candidate.difference;
    next.totalSpentDelta += candidate.difference;
  } else {
    next.balanceDelta += candidate.difference;
    next.totalEarnedDelta += candidate.difference;
  }

  return next;
}

async function assertNoNegativeProjectedBalance(
  userDeltas: Map<string, UserWalletDelta>,
): Promise<void> {
  if (userDeltas.size === 0) {
    return;
  }

  const usersCollection = mongoose.connection.collection('users');
  const userIds = Array.from(userDeltas.keys()).map(
    (id) => new Types.ObjectId(id),
  );

  const users = await usersCollection
    .find(
      { _id: { $in: userIds } },
      { projection: { _id: 1, 'wallet.balance': 1 } },
    )
    .toArray();

  const balanceMap = new Map<string, number>();
  for (const user of users) {
    const rawBalance =
      user &&
      typeof user === 'object' &&
      'wallet' in user &&
      user.wallet &&
      typeof user.wallet === 'object' &&
      'balance' in user.wallet
        ? Number((user.wallet as { balance?: unknown }).balance ?? 0)
        : 0;
    balanceMap.set(user._id.toString(), Number.isFinite(rawBalance) ? rawBalance : 0);
  }

  const negativeUsers: Array<{
    userId: string;
    currentBalance: number;
    balanceDelta: number;
    projectedBalance: number;
  }> = [];

  for (const [userId, delta] of userDeltas.entries()) {
    const currentBalance = balanceMap.get(userId) ?? 0;
    const projectedBalance = currentBalance + delta.balanceDelta;
    if (projectedBalance < 0) {
      negativeUsers.push({
        userId,
        currentBalance,
        balanceDelta: delta.balanceDelta,
        projectedBalance,
      });
    }
  }

  if (negativeUsers.length > 0) {
    console.error(
      `[wallet-unit-migration] aborted: ${negativeUsers.length} users would end with negative balance`,
    );
    for (const user of negativeUsers.slice(0, 20)) {
      console.error(
        `[wallet-unit-migration] user=${user.userId} currentBalance=${user.currentBalance} balanceDelta=${user.balanceDelta} projectedBalance=${user.projectedBalance}`,
      );
    }
    throw new Error('Negative projected balances detected');
  }
}

async function run(): Promise<void> {
  const args = parseCliArgs();
  const apply = args.apply;
  const coinToVndRate = getCoinToVndRate(args.rate);
  const uri = getMongoUri();
  const startedAt = new Date();

  console.log(
    `[wallet-unit-migration] start apply=${apply} rate=${coinToVndRate} uri=${uri}`,
  );
  if (!apply) {
    console.log(
      '[wallet-unit-migration] dry-run mode. Add --apply or set MIGRATION_APPLY=true to execute writes.',
    );
  }

  await mongoose.connect(uri);

  try {
    const transactionsCollection =
      mongoose.connection.collection<LegacyTransaction>('transactions');

    const query: Record<string, unknown> = {
      type: { $in: TARGET_TYPES },
    };
    if (args.userId) {
      query.userId = new Types.ObjectId(args.userId);
    }

    const cursor = transactionsCollection.find(query, {
      projection: { _id: 1, userId: 1, type: 1, amount: 1 },
      sort: { createdAt: 1, _id: 1 },
    });

    const stats: MigrationStats = {
      scanned: 0,
      candidates: 0,
      alreadyNormalized: 0,
      skippedInvalidAmount: 0,
      subscriptionCandidates: 0,
      postRewardCandidates: 0,
    };
    const candidates: MigrationCandidate[] = [];
    const userDeltas = new Map<string, UserWalletDelta>();

    for await (const tx of cursor) {
      stats.scanned += 1;

      try {
        const candidate = buildMigrationCandidate(tx, coinToVndRate);
        if (!candidate) {
          stats.alreadyNormalized += 1;
          continue;
        }

        candidates.push(candidate);
        stats.candidates += 1;
        if (candidate.type === 'subscription') {
          stats.subscriptionCandidates += 1;
        } else {
          stats.postRewardCandidates += 1;
        }

        userDeltas.set(
          candidate.userId,
          applyDelta(userDeltas.get(candidate.userId), candidate),
        );
      } catch {
        stats.skippedInvalidAmount += 1;
      }
    }

    const totalBalanceDelta = Array.from(userDeltas.values()).reduce(
      (sum, item) => sum + item.balanceDelta,
      0,
    );
    const totalSpentDelta = Array.from(userDeltas.values()).reduce(
      (sum, item) => sum + item.totalSpentDelta,
      0,
    );
    const totalEarnedDelta = Array.from(userDeltas.values()).reduce(
      (sum, item) => sum + item.totalEarnedDelta,
      0,
    );

    console.log(
      `[wallet-unit-migration] scanned=${stats.scanned} candidates=${stats.candidates} alreadyNormalized=${stats.alreadyNormalized} skippedInvalidAmount=${stats.skippedInvalidAmount}`,
    );
    console.log(
      `[wallet-unit-migration] subscriptionCandidates=${stats.subscriptionCandidates} postRewardCandidates=${stats.postRewardCandidates} affectedUsers=${userDeltas.size}`,
    );
    console.log(
      `[wallet-unit-migration] projectedDeltas balance=${totalBalanceDelta} totalSpent=${totalSpentDelta} totalEarned=${totalEarnedDelta}`,
    );

    if (!apply || candidates.length === 0) {
      return;
    }

    await assertNoNegativeProjectedBalance(userDeltas);

    const migratedAt = new Date().toISOString();
    const transactionBulkOps = candidates.map((candidate) => ({
      updateOne: {
        filter: {
          _id: candidate.id,
          amount: candidate.originalAmount,
          type: candidate.type,
        },
        update: {
          $set: {
            amount: candidate.correctedAmount,
            'metadata.unitMigration': {
              name: MIGRATION_NAME,
              from: 'coin',
              to: 'wallet_amount',
              rate: coinToVndRate,
              originalAmount: candidate.originalAmount,
              correctedAmount: candidate.correctedAmount,
              migratedAt,
            },
          },
          $currentDate: { updatedAt: true as const },
        },
      },
    }));

    const userBulkOps = Array.from(userDeltas.entries()).map(
      ([userId, delta]) => ({
        updateOne: {
          filter: { _id: new Types.ObjectId(userId) },
          update: {
            $inc: {
              'wallet.balance': delta.balanceDelta,
              'wallet.totalSpent': delta.totalSpentDelta,
              'wallet.totalEarned': delta.totalEarnedDelta,
            },
            $currentDate: { updatedAt: true as const },
          },
        },
      }),
    );

    const transactionBulkResult = await transactionsCollection.bulkWrite(
      transactionBulkOps,
      {
        ordered: false,
      },
    );
    const usersCollection = mongoose.connection.collection('users');
    const userBulkResult = await usersCollection.bulkWrite(userBulkOps, {
      ordered: false,
    });

    console.log(
      `[wallet-unit-migration] applied transactionMatched=${transactionBulkResult.matchedCount} transactionModified=${transactionBulkResult.modifiedCount}`,
    );
    console.log(
      `[wallet-unit-migration] applied userMatched=${userBulkResult.matchedCount} userModified=${userBulkResult.modifiedCount}`,
    );

    const finishedAt = new Date();
    console.log(
      `[wallet-unit-migration] done durationMs=${finishedAt.getTime() - startedAt.getTime()}`,
    );
  } finally {
    await mongoose.disconnect();
  }
}

void run().catch((error: unknown) => {
  console.error('[wallet-unit-migration] failed', error);
  process.exit(1);
});
