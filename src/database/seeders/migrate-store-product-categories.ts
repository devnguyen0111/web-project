import path from 'node:path';
import fs from 'node:fs';
import mongoose, { Schema, Types } from 'mongoose';

type CategoryDoc = {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  scope: 'store' | 'blog' | 'wiki' | 'all';
  order: number;
  isActive: boolean;
};

type ProductDoc = {
  _id: Types.ObjectId;
  categoryId?: Types.ObjectId;
};

const DEFAULT_MONGO_URI = 'mongodb://127.0.0.1:27017/web_project';
const STORE_UNCATEGORIZED_SLUG = 'store-uncategorized';

const CategorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    scope: {
      type: String,
      enum: ['blog', 'store', 'wiki', 'all'],
      default: 'blog',
    },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  {
    collection: 'categories',
    timestamps: true,
    strict: false,
  },
);

const ProductSchema = new Schema(
  {
    categoryId: { type: Schema.Types.ObjectId },
  },
  {
    collection: 'products',
    timestamps: true,
    strict: false,
  },
);

function readEnvFileValue(key: string): string | undefined {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    return undefined;
  }

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
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
    return rawValue.replace(/^"(.*)"$/, '$1').trim();
  }

  return undefined;
}

function getMongoUri() {
  return process.env.MONGODB_URI ?? readEnvFileValue('MONGODB_URI') ?? DEFAULT_MONGO_URI;
}

function isDryRun() {
  return process.argv.slice(2).includes('--dry-run');
}

async function main() {
  const mongoUri = getMongoUri();
  const dryRun = isDryRun();

  await mongoose.connect(mongoUri);

  const CategoryModel = mongoose.models.Category
    ? (mongoose.model('Category') as mongoose.Model<CategoryDoc>)
    : mongoose.model<CategoryDoc>('Category', CategorySchema);

  const ProductModel = mongoose.models.Product
    ? (mongoose.model('Product') as mongoose.Model<ProductDoc>)
    : mongoose.model<ProductDoc>('Product', ProductSchema);

  const existingByName = await CategoryModel.findOne({
    scope: 'store',
    name: { $regex: /^uncategorized$/i },
  })
    .select({ _id: 1, name: 1, slug: 1, scope: 1, order: 1, isActive: 1 })
    .lean<CategoryDoc>()
    .exec();

  let uncategorizedCategory = existingByName;

  if (!uncategorizedCategory) {
    const existingBySlug = await CategoryModel.findOne({ slug: STORE_UNCATEGORIZED_SLUG })
      .select({ _id: 1, name: 1, slug: 1, scope: 1, order: 1, isActive: 1 })
      .lean<CategoryDoc>()
      .exec();

    if (existingBySlug) {
      uncategorizedCategory = existingBySlug;
    }
  }

  if (!uncategorizedCategory && !dryRun) {
    uncategorizedCategory = await CategoryModel.create({
      name: 'Uncategorized',
      slug: STORE_UNCATEGORIZED_SLUG,
      scope: 'store',
      order: 9999,
      isActive: true,
    });
  }

  const unresolvedFilter = {
    $or: [{ categoryId: { $exists: false } }, { categoryId: null }],
  };

  const missingCount = await ProductModel.countDocuments(unresolvedFilter).exec();

  let modifiedCount = 0;
  if (!dryRun && uncategorizedCategory) {
    const updateResult = await ProductModel.updateMany(unresolvedFilter, {
      $set: { categoryId: uncategorizedCategory._id },
    }).exec();
    modifiedCount = updateResult.modifiedCount ?? 0;
  }

  console.log(
    JSON.stringify(
      {
        migration: 'store-product-category-backfill-v1',
        dryRun,
        category: uncategorizedCategory
          ? {
              id: uncategorizedCategory._id.toString(),
              name: uncategorizedCategory.name,
              slug: uncategorizedCategory.slug,
              scope: uncategorizedCategory.scope,
            }
          : null,
        productsWithoutCategory: missingCount,
        modifiedCount,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error('Migration failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
