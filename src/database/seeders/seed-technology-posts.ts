import * as bcrypt from 'bcryptjs';
import mongoose, { Types } from 'mongoose';

interface SeedPost {
  title: string;
  excerpt: string;
  content: string;
}

interface UpsertResult {
  acknowledged: boolean;
  matchedCount: number;
  modifiedCount: number;
  upsertedCount: number;
}

const technologyPosts: SeedPost[] = [
  {
    title: 'AI Agents in 2026: From Chatbots to Task Operators',
    excerpt:
      'A practical look at how modern AI agents moved beyond Q&A and started handling real product workflows.',
    content:
      'AI agents are rapidly shifting from simple assistants into autonomous task operators. Teams now use them for triage, coding, support, and content workflows. The key to success is setting clear boundaries, reliable tool integrations, and measurable outcomes. Companies that pair agent autonomy with robust guardrails can move faster while still preserving quality and compliance.',
  },
  {
    title: 'Edge Computing for Web Apps: Why Latency Wins',
    excerpt:
      'How edge runtimes improve perceived performance and what to watch out for in production.',
    content:
      'Edge deployments reduce round-trip time by moving compute closer to users. For modern web platforms, this often means faster personalization, quicker authentication checks, and better global consistency. The trade-off is operational complexity: you need deterministic code, careful data locality strategies, and observability that works across regions.',
  },
  {
    title: 'TypeScript at Scale: Patterns That Keep Teams Fast',
    excerpt:
      'Strong typing helps large teams collaborate, but only if architecture and boundaries are intentional.',
    content:
      'As TypeScript codebases grow, unstructured sharing of types can create hidden coupling. High-performing teams define domain boundaries, publish explicit contracts, and automate linting plus API checks in CI. This approach keeps refactors predictable and reduces regression risk, while preserving developer velocity.',
  },
  {
    title: 'Building Secure APIs with JWT Rotation',
    excerpt:
      'Token rotation and layered authorization are now baseline requirements for consumer-grade APIs.',
    content:
      'JWT remains common for stateless auth, but secure implementations should pair short-lived access tokens with refresh token rotation. Add role-based checks, endpoint-level scopes, and anomaly detection to reduce abuse. Security posture improves further when logs include correlation IDs and actionable audit trails.',
  },
  {
    title: 'Observability First: Logs, Metrics, and Traces Together',
    excerpt:
      'Debugging distributed systems gets easier when telemetry is designed as a product capability.',
    content:
      'Teams that treat observability as a first-class feature recover faster from incidents. Structured logs, service-level metrics, and distributed traces should share consistent identifiers. When dashboards align with user journeys, engineers can quickly isolate bottlenecks and improve reliability with confidence.',
  },
];

function toSlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

async function getOrCreateAuthorId(): Promise<Types.ObjectId> {
  const usersCollection = mongoose.connection.collection('users');

  const existingAuthor = await usersCollection.findOne(
    { role: { $in: ['author', 'admin'] } },
    { projection: { _id: 1 } },
  );

  if (existingAuthor?._id) {
    return existingAuthor._id as Types.ObjectId;
  }

  const password = await bcrypt.hash('SeedPass123!', 10);
  const now = new Date();

  const inserted = await usersCollection.insertOne({
    fullName: 'Technology Seeder',
    email: 'tech.seeder@example.com',
    password,
    role: 'author',
    createdAt: now,
    updatedAt: now,
  });

  return inserted.insertedId;
}

async function getOrCreateTechnologyCategoryId(): Promise<Types.ObjectId> {
  const categoriesCollection = mongoose.connection.collection('categories');
  const now = new Date();

  const result = await categoriesCollection.findOneAndUpdate(
    { slug: 'technology' },
    {
      $setOnInsert: {
        name: 'Technology',
        slug: 'technology',
        description: 'Technology news, trends, and engineering insights.',
        scope: 'blog',
        ancestors: [],
        order: 1,
        postCount: 0,
        productCount: 0,
        isActive: true,
        createdAt: now,
      },
      $set: {
        updatedAt: now,
      },
    },
    {
      upsert: true,
      returnDocument: 'after',
      includeResultMetadata: true,
    },
  );

  const category = result.value;
  if (!category?._id) {
    throw new Error('Cannot create or load technology category');
  }

  return category._id as Types.ObjectId;
}

async function seedTechnologyPosts(): Promise<void> {
  const uri =
    process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/web_project';

  await mongoose.connect(uri);

  try {
    const authorId = await getOrCreateAuthorId();
    const categoryId = await getOrCreateTechnologyCategoryId();

    const postsCollection = mongoose.connection.collection('posts');
    const categoriesCollection = mongoose.connection.collection('categories');

    let upsertedCount = 0;
    const now = new Date();

    for (let i = 0; i < technologyPosts.length; i += 1) {
      const post = technologyPosts[i];
      const slug = `technology-${i + 1}-${toSlug(post.title)}`;

      const result = (await postsCollection.updateOne(
        { slug },
        {
          $set: {
            authorId,
            title: post.title,
            slug,
            excerpt: post.excerpt,
            content: post.content,
            categoryId,
            tags: [],
            status: 'published',
            views: 0,
            likes: [],
            likesCount: 0,
            bookmarks: [],
            bookmarksCount: 0,
            commentsCount: 0,
            publishedAt: now,
            updatedAt: now,
          },
          $setOnInsert: {
            createdAt: now,
          },
        },
        { upsert: true },
      )) as UpsertResult;

      upsertedCount += result.upsertedCount;
    }

    const totalPostsInCategory = await postsCollection.countDocuments({
      categoryId,
    });

    await categoriesCollection.updateOne(
      { _id: categoryId },
      {
        $set: {
          postCount: totalPostsInCategory,
          updatedAt: new Date(),
        },
      },
    );

    console.log(
      `[seed-technology-posts] done total=${technologyPosts.length} newlyInserted=${upsertedCount} categoryPostCount=${totalPostsInCategory}`,
    );
  } finally {
    await mongoose.disconnect();
  }
}

void seedTechnologyPosts().catch((error: unknown) => {
  console.error('[seed-technology-posts] failed', error);
  process.exit(1);
});
