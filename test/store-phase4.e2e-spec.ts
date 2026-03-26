import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Role } from '../src/common/constants/roles.constant';
import { User } from '../src/users/schemas/user.schema';

interface ApiSuccess<T> {
  success: boolean;
  data: T;
}

interface AuthPayload {
  user: {
    id: string;
    email: string;
    role: Role;
  };
  accessToken: string;
}

describe('Store Phase 4 Flows (e2e)', () => {
  let app: INestApplication;
  let mongoServer: MongoMemoryServer;
  let userModel: Model<User>;

  const apiPrefix = 'api/v1';
  const server = () => app.getHttpServer() as Parameters<typeof request>[0];

  const register = async (input: {
    fullName: string;
    email: string;
    password: string;
  }) => {
    await request(server())
      .post(`/${apiPrefix}/auth/register`)
      .send(input)
      .expect(201);
  };

  const login = async (email: string, password: string) => {
    const res = await request(server())
      .post(`/${apiPrefix}/auth/login`)
      .send({ email, password })
      .expect(201);
    return (res.body as ApiSuccess<AuthPayload>).data;
  };

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();

    process.env.NODE_ENV = 'test';
    process.env.API_PREFIX = apiPrefix;
    process.env.MONGODB_URI = mongoServer.getUri();
    process.env.JWT_ACCESS_SECRET = 'e2e-access-secret';
    process.env.JWT_REFRESH_SECRET = 'e2e-refresh-secret';
    process.env.JWT_ACCESS_EXPIRES_IN = '30m';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
    process.env.STORE_OWNER_USER_ID = '';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix(apiPrefix);

    userModel = moduleFixture.get<Model<User>>(getModelToken(User.name));
    await app.init();
  });

  afterEach(async () => {
    await userModel.deleteMany({});
  });

  afterAll(async () => {
    await app.close();
    await mongoServer.stop();
  });

  it('moderates custom product and runs quote -> accept flow', async () => {
    const adminEmail = 'admin-store@example.com';
    const buyerEmail = 'buyer-store@example.com';
    const password = 'password123';

    await register({
      fullName: 'Admin Store',
      email: adminEmail,
      password,
    });
    await register({
      fullName: 'Buyer Store',
      email: buyerEmail,
      password,
    });

    await userModel.updateOne(
      { email: adminEmail },
      {
        role: Role.ADMIN,
        isEmailVerified: true,
        emailVerificationCodeHash: null,
      },
    );
    await userModel.updateOne(
      { email: buyerEmail },
      {
        role: Role.AUTHOR,
        isEmailVerified: true,
        emailVerificationCodeHash: null,
      },
    );

    const adminAuth = await login(adminEmail, password);
    const buyerAuth = await login(buyerEmail, password);

    const createProductRes = await request(server())
      .post(`/${apiPrefix}/products`)
      .set('Authorization', `Bearer ${adminAuth.accessToken}`)
      .send({
        name: 'Custom API Consulting',
        type: 'custom_order',
        priceAmount: 100000,
        currency: 'VND',
      })
      .expect(201);
    const product = (
      createProductRes.body as ApiSuccess<Record<string, unknown>>
    ).data;
    const productId = String(product.id ?? product._id);
    expect(product.status).toBe('draft');

    const submitReviewRes = await request(server())
      .post(`/${apiPrefix}/products/${productId}/submit-review`)
      .set('Authorization', `Bearer ${adminAuth.accessToken}`)
      .expect(201);
    expect(
      (submitReviewRes.body as ApiSuccess<Record<string, unknown>>).data.status,
    ).toBe('pending_review');

    const pendingRes = await request(server())
      .get(`/${apiPrefix}/store/products/pending-review`)
      .set('Authorization', `Bearer ${adminAuth.accessToken}`)
      .expect(200);
    const pendingData = (
      pendingRes.body as ApiSuccess<{
        data: Array<{ id?: string; _id?: string }>;
      }>
    ).data;
    expect(
      pendingData.data.some(
        (item) => String(item.id ?? item._id) === productId,
      ),
    ).toBe(true);

    const approveRes = await request(server())
      .post(`/${apiPrefix}/store/products/${productId}/approve`)
      .set('Authorization', `Bearer ${adminAuth.accessToken}`)
      .expect(201);
    expect(
      (approveRes.body as ApiSuccess<Record<string, unknown>>).data.status,
    ).toBe('active');

    const createOrderRes = await request(server())
      .post(`/${apiPrefix}/orders`)
      .set('Authorization', `Bearer ${buyerAuth.accessToken}`)
      .send({
        productId,
        quantity: 1,
        idempotencyKey: 'custom-order-e2e-1',
        customData: {
          requirement: 'Need implementation details and source files',
        },
      })
      .expect(201);
    const createdOrder = (
      createOrderRes.body as ApiSuccess<Record<string, unknown>>
    ).data;
    const orderId = String(createdOrder.id ?? createdOrder._id);
    expect(createdOrder.status).toBe('pending');

    await request(server())
      .post(`/${apiPrefix}/wallet/admin/adjust`)
      .set('Authorization', `Bearer ${adminAuth.accessToken}`)
      .send({
        userId: buyerAuth.user.id,
        amount: 300000,
        direction: 'credit',
        reason: 'Seed test wallet',
        idempotencyKey: 'seed-wallet-custom-e2e',
      })
      .expect(201);

    const quoteRes = await request(server())
      .post(`/${apiPrefix}/store/orders/${orderId}/quote`)
      .set('Authorization', `Bearer ${adminAuth.accessToken}`)
      .send({
        priceAmount: 180000,
        estimatedDays: 3,
        note: 'Includes source package and 2 revisions',
      })
      .expect(201);
    expect(
      (quoteRes.body as ApiSuccess<Record<string, unknown>>).data.status,
    ).toBe('quoted');

    const acceptRes = await request(server())
      .post(`/${apiPrefix}/orders/${orderId}/quote/accept`)
      .set('Authorization', `Bearer ${buyerAuth.accessToken}`)
      .send({
        idempotencyKey: 'accept-custom-e2e-1',
      })
      .expect(201);
    const acceptedOrder = (
      acceptRes.body as ApiSuccess<Record<string, unknown>>
    ).data;
    expect(acceptedOrder.status).toBe('processing');
    expect(
      acceptedOrder.buyerTransactionId || acceptedOrder.transactionId,
    ).toBeDefined();
  });
});
