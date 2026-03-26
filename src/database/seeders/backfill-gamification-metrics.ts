import mongoose, { Types } from 'mongoose';

type LevelState = {
  level: number;
  xpToNextLevel: number;
};

const POST_APPROVED_XP = 50;
const ORDER_COMPLETED_XP = 100;

function getXpRequirementForLevel(level: number): number {
  return Math.max(100, level * 100);
}

function normalizeLevel(xp: number): LevelState {
  let level = 1;
  let consumed = 0;
  let nextRequirement = getXpRequirementForLevel(level);

  while (xp >= consumed + nextRequirement) {
    consumed += nextRequirement;
    level += 1;
    nextRequirement = getXpRequirementForLevel(level);
  }

  return {
    level,
    xpToNextLevel: Math.max(1, consumed + nextRequirement - xp),
  };
}

async function backfillGamificationMetrics(): Promise<void> {
  const uri =
    process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/web_project';
  await mongoose.connect(uri);

  try {
    const usersCollection = mongoose.connection.collection('users');
    const postsCollection = mongoose.connection.collection('posts');
    const ordersCollection = mongoose.connection.collection('orders');

    const users = await usersCollection
      .find({}, { projection: { _id: 1 } })
      .toArray();

    let updatedCount = 0;

    for (const user of users) {
      const userId = user._id as Types.ObjectId;

      const [postsPublished, salesCount] = await Promise.all([
        postsCollection.countDocuments({
          authorId: userId,
          status: 'published',
        }),
        ordersCollection.countDocuments({
          sellerId: userId,
          status: 'completed',
        }),
      ]);

      const xp =
        postsPublished * POST_APPROVED_XP + salesCount * ORDER_COMPLETED_XP;
      const normalized = normalizeLevel(xp);

      await usersCollection.updateOne(
        { _id: userId },
        {
          $set: {
            gamification: {
              xp,
              level: normalized.level,
              xpToNextLevel: normalized.xpToNextLevel,
              postsPublished,
              salesCount,
            },
            updatedAt: new Date(),
          },
        },
      );
      updatedCount += 1;
    }

    console.log(`[backfill-gamification-metrics] done users=${updatedCount}`);
  } finally {
    await mongoose.disconnect();
  }
}

void backfillGamificationMetrics().catch((error: unknown) => {
  console.error('[backfill-gamification-metrics] failed', error);
  process.exit(1);
});
