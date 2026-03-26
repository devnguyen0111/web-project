import mongoose, { Types } from 'mongoose';

type AnyDoc = Record<string, unknown>;

const BATCH_SIZE = 500;

function parseApplyFlag(): boolean {
  if (process.argv.includes('--apply')) {
    return true;
  }

  const envValue = process.env.MIGRATION_APPLY?.toLowerCase();
  return envValue === '1' || envValue === 'true' || envValue === 'yes';
}

function normalizeUsernameBase(fullName: string, userId: string): string {
  const normalized = fullName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const fallback = `user-${userId.slice(-6).toLowerCase()}`;
  const base = (normalized || fallback).slice(0, 60).replace(/^-+|-+$/g, '');
  if (base.length >= 3) {
    return base;
  }

  return `${base}user`.slice(0, 60);
}

function buildUniqueUsername(base: string, used: Set<string>): string {
  let candidate = base;
  let counter = 1;
  while (used.has(candidate)) {
    counter += 1;
    const suffix = `-${counter}`;
    const trimmedBase = base.slice(0, Math.max(3, 60 - suffix.length));
    candidate = `${trimmedBase}${suffix}`;
  }

  return candidate;
}

async function run(): Promise<void> {
  const uri =
    process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/web_project';
  const apply = parseApplyFlag();

  console.log(`[username-backfill] start apply=${apply} uri=${uri}`);
  if (!apply) {
    console.log(
      '[username-backfill] dry-run mode. Add --apply or set MIGRATION_APPLY=true to execute writes.',
    );
  }

  await mongoose.connect(uri);

  try {
    const users = mongoose.connection.collection('users');
    const existingUsernames = await users
      .find(
        {
          username: {
            $exists: true,
            $type: 'string',
            $ne: '',
          },
        },
        { projection: { username: 1 } },
      )
      .toArray();

    const used = new Set(
      existingUsernames
        .map((item) => String((item as AnyDoc).username || '').trim())
        .filter(Boolean)
        .map((item) => item.toLowerCase()),
    );

    const cursor = users.find(
      {
        $or: [
          { username: { $exists: false } },
          { username: null },
          { username: '' },
        ],
      },
      {
        projection: {
          _id: 1,
          fullName: 1,
        },
      },
    );

    let scanned = 0;
    let changed = 0;
    const ops: AnyDoc[] = [];

    while (true) {
      const user = await cursor.next();
      if (!user) {
        break;
      }

      scanned += 1;
      const rawId = (user as AnyDoc)._id;
      if (!rawId) {
        continue;
      }

      const userId = new Types.ObjectId(String(rawId)).toString();
      const fullName = String((user as AnyDoc).fullName ?? '').trim();
      const base = normalizeUsernameBase(fullName, userId);
      const username = buildUniqueUsername(base, used);
      used.add(username);

      changed += 1;
      ops.push({
        updateOne: {
          filter: { _id: rawId },
          update: { $set: { username } },
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
      `[username-backfill] done scanned=${scanned} changed=${changed} apply=${apply}`,
    );
  } finally {
    await mongoose.disconnect();
  }
}

void run().catch((error: unknown) => {
  console.error('[username-backfill] failed', error);
  process.exit(1);
});
