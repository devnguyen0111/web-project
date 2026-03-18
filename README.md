# Web Project API

NestJS backend for auth, user management, and blog workflows with MongoDB, JWT, MinIO/S3, SMTP email, and Swagger.

## What is in here

- Auth: register, email verification, login, refresh token, logout, forgot/reset password.
- Users: current profile, avatar upload, admin user management.
- Blog: categories, tags, posts, moderation, comments, likes, bookmarks, poll voting, view tracking.
- Infra: MongoDB, MinIO bucket bootstrap, Handlebars mail templates, global validation/response/error handling.

## Requirements

- Node.js 20+
- npm 10+
- MongoDB
- MinIO or another S3-compatible object storage
- SMTP account if you want real email delivery

## Setup Checklist

1. Install dependencies.

```bash
npm install
```

2. Create your local env file.

```bash
cp .env.example .env
```

3. Update `.env` for your machine.

- `NODE_ENV`, `PORT`, `API_PREFIX`
- `MONGODB_URI`
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
- `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`
- `EMAIL_VERIFICATION_CODE_EXPIRES_IN_MINUTES`, `PASSWORD_RESET_CODE_EXPIRES_IN_MINUTES`
- `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM`
- `S3_ENDPOINT`, `S3_PORT`, `S3_USE_SSL`, `S3_INIT_BUCKETS`
- `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`, `S3_PUBLIC_URL`
- `S3_BUCKET_BLOG_IMAGES`, `S3_BUCKET_AVATARS`, `S3_BUCKET_PUBLIC`, `S3_BUCKET_PRODUCTS`, `S3_BUCKET_TICKETS`

## Run

```bash
# Development
npm run start:dev

# Build
npm run build

# Production
npm run start:prod
```

Default URLs:

- API: `http://localhost:3000/api/v1`
- Swagger: `http://localhost:3000/api/v1/docs`

## Scripts

- `npm run start`
- `npm run start:dev`
- `npm run start:debug`
- `npm run start:prod`
- `npm run build`
- `npm run format`
- `npm run lint` (runs ESLint with `--fix`)
- `npm run test`
- `npm run test:watch`
- `npm run test:cov`
- `npm run test:debug`
- `npm run test:e2e`
- `npm run migrate:role-user-to-author`
- `npm run migrate:post-content-to-blocks`
- `npm run seed:technology-posts`

## API Summary

### Public

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/verify-email`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `POST /auth/refresh`
- `GET /posts`
- `GET /posts/:slug`
- `GET /posts/:postId/poll/results`
- `GET /posts/:postId/comments`
- `GET /categories`
- `GET /tags`
- `GET /tags/:slug/posts`

### Authenticated

- `GET /auth/me`
- `POST /auth/logout`
- `GET /users/me`
- `PATCH /users/me`
- `PATCH /users/me/avatar`
- `GET /posts/me`
- `GET /posts/me/:id`
- `POST /posts`
- `PATCH /posts/:id`
- `DELETE /posts/:id`
- `POST /posts/:id/submit`
- `POST /posts/:id/cover-image`
- `POST /posts/block-image`
- `POST /posts/:id/like`
- `GET /posts/:id/like-status`
- `POST /posts/:id/bookmark`
- `POST /posts/:postId/poll/vote`
- `POST /posts/:postId/comments`
- `PATCH /comments/:id`
- `DELETE /comments/:id`
- `POST /comments/:id/like`

### Staff/Admin

- `GET /users`
- `GET /users/:id`
- `PATCH /users/:id`
- `PATCH /users/:id/role`
- `PATCH /users/:id/status`
- `GET /categories/admin/all`
- `POST /categories`
- `PATCH /categories/:id`
- `DELETE /categories/:id`
- `GET /tags/admin/all`
- `POST /tags`
- `PATCH /tags/:id`
- `DELETE /tags/:id`
- `GET /moderation/posts`
- `GET /moderation/posts/:id`
- `PATCH /moderation/posts/:id/approve`
- `PATCH /moderation/posts/:id/reject`
- `PATCH /comments/:id/hide`

Auth uses bearer JWT. Public routes do not require a token.

## Env Notes

- `S3_ENDPOINT` can be a host name or a full `http(s)://...` URL. The app parses both.
- If SMTP is not fully configured, mail sending falls back to log preview mode.
- If `S3_INIT_BUCKETS=true` and storage credentials are present, the app tries to create the configured buckets on startup.
- In this workspace, `.env` is already pointed at remote MongoDB and S3/SMTP values. Replace them before running locally or committing changes.

## Validation

Verified on `2026-03-18`:

```bash
npm run build
npm test -- --runInBand
npm run test:e2e -- --runInBand --testTimeout=30000
```

The default `npm run test:e2e` hits Jest's 5s timeout on the longer auth/blog flows, so use the longer timeout command above.
