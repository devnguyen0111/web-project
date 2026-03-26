import mongoose from 'mongoose';

const defaultBadges: Array<{
  code: string;
  name: string;
  description: string;
  criteria: { type: string; threshold: number };
  xpReward: number;
}> = [
  {
    code: 'first-post',
    name: 'First Post',
    description: 'Publish your first approved post.',
    criteria: { type: 'posts_published', threshold: 1 },
    xpReward: 25,
  },
  {
    code: 'content-writer-10',
    name: 'Content Writer',
    description: 'Reach 10 approved posts.',
    criteria: { type: 'posts_published', threshold: 10 },
    xpReward: 100,
  },
  {
    code: 'first-sale',
    name: 'First Sale',
    description: 'Complete your first sale.',
    criteria: { type: 'sales_count', threshold: 1 },
    xpReward: 30,
  },
  {
    code: 'seller-10',
    name: 'Trusted Seller',
    description: 'Complete 10 sales.',
    criteria: { type: 'sales_count', threshold: 10 },
    xpReward: 120,
  },
  {
    code: 'level-5',
    name: 'Level 5',
    description: 'Reach level 5.',
    criteria: { type: 'level_reached', threshold: 5 },
    xpReward: 80,
  },
];

async function seedGamificationBadges(): Promise<void> {
  const uri =
    process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/web_project';
  await mongoose.connect(uri);

  try {
    const badgesCollection = mongoose.connection.collection('badges');
    let upsertedCount = 0;
    const now = new Date();

    for (const badge of defaultBadges) {
      const result = await badgesCollection.updateOne(
        { code: badge.code },
        {
          $setOnInsert: {
            ...badge,
            isActive: true,
            createdAt: now,
          },
          $set: {
            updatedAt: now,
          },
        },
        { upsert: true },
      );

      if (result.upsertedCount) {
        upsertedCount += 1;
      }
    }

    console.log(
      `[seed-gamification-badges] done total=${defaultBadges.length} upserted=${upsertedCount}`,
    );
  } finally {
    await mongoose.disconnect();
  }
}

void seedGamificationBadges().catch((error: unknown) => {
  console.error('[seed-gamification-badges] failed', error);
  process.exit(1);
});
