import mongoose from 'mongoose';

interface MigrationResult {
  acknowledged: boolean;
  matchedCount: number;
  modifiedCount: number;
}

async function run(): Promise<void> {
  const uri =
    process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/web_project';

  await mongoose.connect(uri);

  try {
    const usersCollection = mongoose.connection.collection('users');

    const result = (await usersCollection.updateMany(
      { role: 'user' },
      { $set: { role: 'author' } },
    )) as MigrationResult;

    console.log(
      `[role-migration] matched=${result.matchedCount} modified=${result.modifiedCount}`,
    );
  } finally {
    await mongoose.disconnect();
  }
}

void run().catch((error: unknown) => {
  console.error('[role-migration] failed', error);
  process.exit(1);
});
