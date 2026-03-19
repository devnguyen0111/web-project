import mongoose from 'mongoose';
import {
  ProductSchema,
  ProductStatus,
  ProductType,
} from '../../store/products/schemas/product.schema';
import { UserSchema } from '../../users/schemas/user.schema';
import { Role } from '../../common/constants/roles.constant';
import * as dotenv from 'dotenv';

dotenv.config({
  path: process.env.NODE_ENV === 'production' ? '.env' : '.env',
});

const MONGO_URI =
  process.env.DATABASE_URI ||
  process.env.MONGODB_URI ||
  process.env.MONGO_URI ||
  process.env['database.uri'];

const PRODUCT_NAMES = [
  'Gaming Boost Package',
  'Streaming Premium Plan',
  'Music Plus Access',
  'Design Pro Toolkit',
  'Office Suite License',
  'Cloud Storage Premium',
  'AI Assistant Pro',
];

async function main() {
  if (!MONGO_URI) {
    throw new Error('Missing MongoDB connection string in env');
  }
  await mongoose.connect(MONGO_URI);

  // Lấy user đầu tiên có role STAFF hoặc ADMIN
  const seller = await mongoose
    .model('User', UserSchema)
    .findOne({ role: { $in: [Role.STAFF, Role.ADMIN] } });
  if (!seller) {
    throw new Error('No STAFF or ADMIN user found to assign as seller');
  }

  for (const name of PRODUCT_NAMES) {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const exists = await mongoose
      .model('Product', ProductSchema)
      .findOne({ slug });
    if (exists) {
      console.log(`Product '${name}' already exists, skipping.`);
      continue;
    }
    await mongoose.model('Product', ProductSchema).create({
      sellerId: seller._id,
      name,
      slug,
      price: 100000,
      type: ProductType.DIGITAL,
      status: ProductStatus.ACTIVE,
      stock: 100,
      tags: [],
      images: [],
      isOnSale: false,
      isFeatured: false,
      subscriberDiscount: { pro: 0, vip: 0 },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log(`Seeded product: ${name}`);
  }

  await mongoose.disconnect();
  console.log('Done seeding products.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
