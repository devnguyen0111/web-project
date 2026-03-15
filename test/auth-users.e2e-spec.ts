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
  timestamp: string;
}

interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

interface AuthPayload {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

interface PaginatedUsersPayload {
  data: AuthUser[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

describe('Auth & Users (e2e)', () => {
  let app: INestApplication;
  let mongoServer: MongoMemoryServer;
  let userModel: Model<User>;

  const apiPrefix = 'api/v1';
  const server = () => app.getHttpServer() as Parameters<typeof request>[0];

  const successBody = <T>(res: request.Response): ApiSuccess<T> => {
    return res.body as ApiSuccess<T>;
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

  it('register -> login -> me -> update profile -> refresh -> logout', async () => {
    const registerPayload = {
      fullName: 'Test User',
      email: 'user1@example.com',
      password: 'password123',
    };

    const registerRes = await request(server())
      .post(`/${apiPrefix}/auth/register`)
      .send(registerPayload)
      .expect(201);

    const registerBody = successBody<AuthPayload>(registerRes);
    expect(registerBody.success).toBe(true);
    expect(registerBody.data.user.email).toBe(registerPayload.email);
    expect(registerBody.data.accessToken).toBeDefined();
    expect(registerBody.data.refreshToken).toBeDefined();

    const loginRes = await request(server())
      .post(`/${apiPrefix}/auth/login`)
      .send({
        email: registerPayload.email,
        password: registerPayload.password,
      })
      .expect(201);

    const loginBody = successBody<AuthPayload>(loginRes);
    const accessToken = loginBody.data.accessToken;
    const refreshToken = loginBody.data.refreshToken;

    const meRes = await request(server())
      .get(`/${apiPrefix}/auth/me`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const meBody = successBody<AuthUser>(meRes);
    expect(meBody.success).toBe(true);
    expect(meBody.data.email).toBe(registerPayload.email);

    const updateRes = await request(server())
      .patch(`/${apiPrefix}/users/profile`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: 'Updated User' })
      .expect(200);

    const updateBody = successBody<AuthUser>(updateRes);
    expect(updateBody.data.fullName).toBe('Updated User');

    const refreshRes = await request(server())
      .post(`/${apiPrefix}/auth/refresh`)
      .send({ refreshToken })
      .expect(201);

    const refreshBody = successBody<AuthPayload>(refreshRes);
    expect(refreshBody.success).toBe(true);
    expect(refreshBody.data.accessToken).toBeDefined();
    expect(refreshBody.data.refreshToken).toBeDefined();

    await request(server())
      .post(`/${apiPrefix}/auth/logout`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    await request(server())
      .post(`/${apiPrefix}/auth/refresh`)
      .send({ refreshToken })
      .expect(401);
  });

  it('admin can list users, normal user cannot', async () => {
    const userEmail = 'normal@example.com';
    const adminEmail = 'admin@example.com';
    const password = 'password123';

    await request(server())
      .post(`/${apiPrefix}/auth/register`)
      .send({ fullName: 'Normal User', email: userEmail, password })
      .expect(201);

    await request(server())
      .post(`/${apiPrefix}/auth/register`)
      .send({ fullName: 'Admin User', email: adminEmail, password })
      .expect(201);

    await userModel.updateOne({ email: adminEmail }, { role: Role.ADMIN });

    const userLoginRes = await request(server())
      .post(`/${apiPrefix}/auth/login`)
      .send({ email: userEmail, password })
      .expect(201);

    const adminLoginRes = await request(server())
      .post(`/${apiPrefix}/auth/login`)
      .send({ email: adminEmail, password })
      .expect(201);

    const userToken = successBody<AuthPayload>(userLoginRes).data.accessToken;
    const adminToken = successBody<AuthPayload>(adminLoginRes).data.accessToken;

    await request(server())
      .get(`/${apiPrefix}/users`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);

    const adminListRes = await request(server())
      .get(`/${apiPrefix}/users?page=1&limit=10`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const listBody = successBody<PaginatedUsersPayload>(adminListRes);
    expect(listBody.success).toBe(true);
    expect(listBody.data.total).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(listBody.data.data)).toBe(true);
  });
});
