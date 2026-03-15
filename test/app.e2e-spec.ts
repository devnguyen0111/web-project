import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { AppModule } from './../src/app.module';

interface SuccessResponse<T> {
  success: boolean;
  data: T;
}

describe('AppController (e2e)', () => {
  let app: INestApplication;
  let mongoServer: MongoMemoryServer;
  const apiPrefix = 'api/v1';

  const server = () => app.getHttpServer() as Parameters<typeof request>[0];

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();

    process.env.NODE_ENV = 'test';
    process.env.API_PREFIX = apiPrefix;
    process.env.MONGODB_URI = mongoServer.getUri();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix(apiPrefix);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await mongoServer.stop();
  });

  it('/ (GET)', () => {
    return request(server())
      .get(`/${apiPrefix}`)
      .expect(200)
      .expect((res) => {
        const body = res.body as SuccessResponse<string>;
        expect(body.success).toBe(true);
        expect(body.data).toBe('Hello World!');
      });
  });
});
