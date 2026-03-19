import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { createHmac } from 'crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Types } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { User } from '../src/users/schemas/user.schema';
import {
  ExternalPaymentProvider,
  Transaction,
  TransactionStatus,
  TransactionType,
} from '../src/wallet/schemas/transaction.schema';

interface ApiSuccess<T> {
  success: boolean;
  data: T;
}

interface AuthPayload {
  user: {
    id: string;
    email: string;
  };
  accessToken: string;
}

const buildPayosReturnSignature = (
  payload: Record<string, unknown>,
  checksumKey: string,
) => {
  const signatureData = Object.keys(payload)
    .sort()
    .filter((key) => payload[key] !== undefined)
    .map((key) => `${key}=${String(payload[key] ?? '')}`)
    .join('&');
  return createHmac('sha256', checksumKey).update(signatureData).digest('hex');
};

describe('Payment return & health readiness (e2e)', () => {
  let app: INestApplication;
  let mongoServer: MongoMemoryServer;
  let userModel: Model<User>;
  let transactionModel: Model<Transaction>;

  const apiPrefix = 'api/v1';
  const checksumKey = 'e2e-payos-checksum-key';
  const server = () => app.getHttpServer() as Parameters<typeof request>[0];

  const registerAndLogin = async (email: string, password: string) => {
    await request(server())
      .post(`/${apiPrefix}/auth/register`)
      .send({
        fullName: 'Payment E2E User',
        email,
        password,
      })
      .expect(201);

    await userModel.updateOne(
      { email },
      {
        isEmailVerified: true,
        emailVerificationCodeHash: null,
      },
    );

    const loginRes = await request(server())
      .post(`/${apiPrefix}/auth/login`)
      .send({ email, password })
      .expect(201);

    return (loginRes.body as ApiSuccess<AuthPayload>).data;
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
    process.env.PAYOS_CHECKSUM_KEY = checksumKey;
    process.env.PAYOS_CLIENT_ID = '';
    process.env.PAYOS_API_KEY = '';
    process.env.PAYOS_RETURN_URL = '';
    process.env.PAYOS_CANCEL_URL = '';
    process.env.PAYOS_WEBHOOK_URL = '';

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
    transactionModel = moduleFixture.get<Model<Transaction>>(
      getModelToken(Transaction.name),
    );

    await app.init();
  });

  afterEach(async () => {
    await transactionModel.deleteMany({});
    await userModel.deleteMany({});
  });

  afterAll(async () => {
    await app.close();
    await mongoServer.stop();
  });

  it('returns 503 for readiness when critical config is degraded', async () => {
    await request(server()).get(`/${apiPrefix}/health/ready`).expect(503);
  });

  it('requires auth for payos return-sync and return-status endpoints', async () => {
    await request(server())
      .post(`/${apiPrefix}/payment/payos/return-sync`)
      .send({ orderCode: '1773857686372' })
      .expect(401);

    await request(server())
      .get(`/${apiPrefix}/payment/payos/return-status?orderCode=1773857686372`)
      .expect(401);
  });

  it('syncs cancelled payos return and reflects status in return-status endpoint', async () => {
    const auth = await registerAndLogin('payment-e2e@example.com', 'password123');
    const userId = auth.user.id;
    const accessToken = auth.accessToken;

    const orderCode = '1773857686372';
    const paymentLinkId = 'f60d5607d7d04b29842ea25e16b6a0b5';
    const createdTx = await transactionModel.create({
      userId: new Types.ObjectId(userId),
      type: TransactionType.DEPOSIT,
      amount: 10000,
      balanceBefore: 0,
      balanceAfter: 0,
      status: TransactionStatus.PENDING,
      externalPayment: {
        provider: ExternalPaymentProvider.PAYOS,
        externalId: orderCode,
        orderCode: Number(orderCode),
        paymentLinkId,
      },
    });

    const payload = {
      orderCode,
      paymentLinkId,
      id: paymentLinkId,
      status: 'CANCELLED',
      cancel: 'true',
      code: '00',
    };
    const signature = buildPayosReturnSignature(payload, checksumKey);

    const syncRes = await request(server())
      .post(`/${apiPrefix}/payment/payos/return-sync`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-payment-signature', signature)
      .send(payload)
      .expect(200);

    const syncBody = syncRes.body as ApiSuccess<{
      code: string;
      message: string;
    }>;
    expect(syncBody.success).toBe(true);
    expect(syncBody.data.code).toBe('00');

    const updatedTx = await transactionModel.findById(createdTx._id).exec();
    expect(updatedTx?.status).toBe(TransactionStatus.FAILED);

    const statusRes = await request(server())
      .get(
        `/${apiPrefix}/payment/payos/return-status?orderCode=${orderCode}&id=${paymentLinkId}&status=CANCELLED&cancel=true`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const statusBody = statusRes.body as ApiSuccess<{
      status: string;
      transaction?: { id: string };
    }>;
    expect(statusBody.success).toBe(true);
    expect(['cancelled', 'failed']).toContain(statusBody.data.status);
    expect(statusBody.data.transaction?.id).toBe(createdTx._id.toString());
  });
});
