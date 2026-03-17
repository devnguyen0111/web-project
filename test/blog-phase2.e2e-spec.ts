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
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    role: Role;
    email: string;
  };
}

describe('Blog Phase 2 (e2e)', () => {
  let app: INestApplication;
  let mongoServer: MongoMemoryServer;
  let userModel: Model<User>;

  const apiPrefix = 'api/v1';
  const server = () => app.getHttpServer() as Parameters<typeof request>[0];

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

  afterAll(async () => {
    await app.close();
    await mongoServer.stop();
  });

  it('handles draft -> moderation -> publish -> poll/comment flow', async () => {
    const password = 'password123';
    const authorEmail = 'author.phase2@example.com';
    const adminEmail = 'admin.phase2@example.com';

    await request(server())
      .post(`/${apiPrefix}/auth/register`)
      .send({
        fullName: 'Author Phase 2',
        email: authorEmail,
        password,
      })
      .expect(201);

    await request(server())
      .post(`/${apiPrefix}/auth/register`)
      .send({
        fullName: 'Admin Phase 2',
        email: adminEmail,
        password,
      })
      .expect(201);

    await userModel.updateOne(
      { email: authorEmail },
      {
        isEmailVerified: true,
        emailVerificationCodeHash: null,
      },
    );

    await userModel.updateOne(
      { email: adminEmail },
      {
        role: Role.ADMIN,
        isEmailVerified: true,
        emailVerificationCodeHash: null,
      },
    );

    const authorLogin = await request(server())
      .post(`/${apiPrefix}/auth/login`)
      .send({ email: authorEmail, password })
      .expect(201);

    const adminLogin = await request(server())
      .post(`/${apiPrefix}/auth/login`)
      .send({ email: adminEmail, password })
      .expect(201);

    const authorToken = (authorLogin.body as ApiSuccess<AuthPayload>).data
      .accessToken;
    const adminToken = (adminLogin.body as ApiSuccess<AuthPayload>).data
      .accessToken;

    const categoryRes = await request(server())
      .post(`/${apiPrefix}/categories`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Backend',
      })
      .expect(201);

    const categoryId = (categoryRes.body as ApiSuccess<{ _id: string }>).data
      ._id;

    const tagRes = await request(server())
      .post(`/${apiPrefix}/tags`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'nestjs' })
      .expect(201);

    const tagId = (tagRes.body as ApiSuccess<{ _id: string }>).data._id;

    await request(server())
      .post(`/${apiPrefix}/posts`)
      .set('Authorization', `Bearer ${authorToken}`)
      .send({
        title: 'Expired poll post',
        blocks: [
          {
            type: 'paragraph',
            text: 'This post should fail because poll ended in the past',
          },
        ],
        poll: {
          question: 'Expired poll?',
          options: [{ text: 'Yes' }, { text: 'No' }],
          isPermanent: false,
          endsAt: new Date(Date.now() - 60_000).toISOString(),
        },
      })
      .expect(400);

    const createPostRes = await request(server())
      .post(`/${apiPrefix}/posts`)
      .set('Authorization', `Bearer ${authorToken}`)
      .send({
        title: 'Phase 2 Post',
        blocks: [
          {
            type: 'paragraph',
            text: 'This is a test post for phase 2 blog flow',
          },
        ],
        categoryId,
        tagIds: [tagId],
        poll: {
          question: 'Is this useful?',
          options: [{ text: 'Yes' }, { text: 'No' }],
        },
      })
      .expect(201);

    const createdPost = (
      createPostRes.body as ApiSuccess<{ _id: string; slug: string }>
    ).data;

    await request(server())
      .post(`/${apiPrefix}/posts/${createdPost._id}/submit`)
      .set('Authorization', `Bearer ${authorToken}`)
      .expect(201);

    await request(server())
      .get(`/${apiPrefix}/moderation/posts/${createdPost._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect((res) => {
        const data = (res.body as ApiSuccess<{ _id: string; status: string }>)
          .data;
        expect(data._id).toBe(createdPost._id);
        expect(data.status).toBe('pending');
      });

    await request(server())
      .get(`/${apiPrefix}/moderation/posts?page=1&limit=10`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect((res) => {
        const data = (res.body as ApiSuccess<{ data: Array<{ _id: string }> }>)
          .data.data;
        expect(data.some((item) => item._id === createdPost._id)).toBe(true);
      });

    await request(server())
      .patch(`/${apiPrefix}/moderation/posts/${createdPost._id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(server())
      .get(`/${apiPrefix}/posts`)
      .expect(200)
      .expect((res) => {
        const data = (res.body as ApiSuccess<{ data: Array<{ _id: string }> }>)
          .data.data;
        expect(data.some((item) => item._id === createdPost._id)).toBe(true);
      });

    await request(server())
      .get(`/${apiPrefix}/posts/${createdPost._id}/like-status`)
      .set('Authorization', `Bearer ${authorToken}`)
      .expect(200)
      .expect((res) => {
        const payload = (
          res.body as ApiSuccess<{ liked: boolean; likesCount: number }>
        ).data;
        expect(payload.liked).toBe(false);
        expect(payload.likesCount).toBe(0);
      });

    await request(server())
      .post(`/${apiPrefix}/posts/${createdPost._id}/like`)
      .set('Authorization', `Bearer ${authorToken}`)
      .expect(201)
      .expect((res) => {
        const payload = (
          res.body as ApiSuccess<{ liked: boolean; likesCount: number }>
        ).data;
        expect(payload.liked).toBe(true);
        expect(payload.likesCount).toBe(1);
      });

    await request(server())
      .post(`/${apiPrefix}/posts/${createdPost._id}/like`)
      .set('Authorization', `Bearer ${authorToken}`)
      .expect(201)
      .expect((res) => {
        const payload = (
          res.body as ApiSuccess<{ liked: boolean; likesCount: number }>
        ).data;
        expect(payload.liked).toBe(false);
        expect(payload.likesCount).toBe(0);
      });

    await request(server())
      .post(`/${apiPrefix}/posts/${createdPost._id}/poll/vote`)
      .set('Authorization', `Bearer ${authorToken}`)
      .send({ optionIndex: 0 })
      .expect(201);

    await request(server())
      .post(`/${apiPrefix}/posts/${createdPost._id}/comments`)
      .set('Authorization', `Bearer ${authorToken}`)
      .send({ content: 'Nice article' })
      .expect(201);

    await request(server())
      .get(`/${apiPrefix}/posts/${createdPost._id}/comments`)
      .expect(200)
      .expect((res) => {
        const comments = (
          res.body as ApiSuccess<{ data: Array<{ content: string }> }>
        ).data.data;
        expect(comments.length).toBe(1);
        expect(comments[0].content).toBe('Nice article');
      });

    await request(server())
      .get(`/${apiPrefix}/posts/${createdPost.slug}`)
      .set('purpose', 'prefetch')
      .expect(200)
      .expect((res) => {
        const post = (res.body as ApiSuccess<{ views: number }>).data;
        expect(post.views).toBe(0);
      });

    await request(server())
      .get(`/${apiPrefix}/posts/${createdPost.slug}`)
      .expect(200)
      .expect((res) => {
        const post = (res.body as ApiSuccess<{ views: number }>).data;
        expect(post.views).toBe(1);
      });

    await request(server())
      .get(`/${apiPrefix}/posts/${createdPost.slug}`)
      .expect(200)
      .expect((res) => {
        const post = (res.body as ApiSuccess<{ views: number }>).data;
        expect(post.views).toBe(1);
      });

    await request(server())
      .patch(`/${apiPrefix}/posts/${createdPost._id}`)
      .set('Authorization', `Bearer ${authorToken}`)
      .send({ excerpt: 'Edited by author after publish' })
      .expect(200)
      .expect((res) => {
        const payload = (
          res.body as ApiSuccess<{
            status: string;
            author: { fullName: string };
          }>
        ).data;
        expect(payload.status).toBe('pending');
        expect(payload.author.fullName).toBe('Author Phase 2');
      });

    await request(server())
      .get(`/${apiPrefix}/posts`)
      .expect(200)
      .expect((res) => {
        const data = (res.body as ApiSuccess<{ data: Array<{ _id: string }> }>)
          .data.data;
        expect(data.some((item) => item._id === createdPost._id)).toBe(false);
      });

    await request(server())
      .get(`/${apiPrefix}/posts/me/${createdPost._id}`)
      .set('Authorization', `Bearer ${authorToken}`)
      .expect(200)
      .expect((res) => {
        const payload = (
          res.body as ApiSuccess<{
            _id: string;
            status: string;
            author: { fullName: string };
          }>
        ).data;
        expect(payload._id).toBe(createdPost._id);
        expect(payload.status).toBe('pending');
        expect(payload.author.fullName).toBe('Author Phase 2');
      });
  }, 30000);
});
