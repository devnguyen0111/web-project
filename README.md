# Web Project API (NestJS)

Backend API for authentication, users, and blog workflows (draft, moderation, publish), with MongoDB, MinIO integration, and email-based verification/reset flows.

## Current Scope

- Auth: register, email verification, login, refresh token, logout, forgot/reset password, JWT guards.
- Users: profile and role-based access.
- Blog: categories, tags, posts, moderation, comments, poll voting.
- File storage: MinIO/S3 client + bucket handling.
- API docs: Swagger at runtime.

This repository is currently a **NestJS backend project**.
For broader product planning and future modules, see `PROJECT_DOCS.md`.

## Tech Stack

- Node.js + TypeScript
- NestJS 11
- MongoDB + Mongoose
- JWT + Passport
- MinIO (S3-compatible object storage)
- Jest + Supertest + mongodb-memory-server (tests)
- Swagger (`@nestjs/swagger`)

## Project Structure

```text
web-project/
  src/
    auth/
    blog/
    users/
    minio/
    database/
    config/
    common/
    main.ts
    app.module.ts
  test/
    app.e2e-spec.ts
    auth-users.e2e-spec.ts
    blog-phase2.e2e-spec.ts
  .env.example
  package.json
```

## Requirements

- Node.js 20+
- npm 10+
- MongoDB (local or remote)
- MinIO/S3 (optional for some local flows)

## Install

```bash
npm install
```

## Run

```bash
# Development
npm run start:dev

# Build
npm run build

# Production
npm run start:prod
```

Default base URL:

- API: `http://localhost:3000/api/v1`
- Swagger: `http://localhost:3000/api/v1/docs`

## Environment Variables

Copy `.env.example` to `.env` and adjust values.

```bash
cp .env.example .env
```

Core variables:

- `PORT`: API port (default `3000`)
- `API_PREFIX`: global prefix (default `api/v1`)
- `MONGODB_URI`: MongoDB connection string
- `JWT_ACCESS_SECRET`: required access-token secret
- `JWT_REFRESH_SECRET`: required refresh-token secret
- `JWT_ACCESS_EXPIRES_IN`: access token TTL (default `15m`)
- `JWT_REFRESH_EXPIRES_IN`: refresh token TTL (default `7d`)
- `EMAIL_VERIFICATION_CODE_EXPIRES_IN_MINUTES`: verification code TTL (default `10`)
- `PASSWORD_RESET_CODE_EXPIRES_IN_MINUTES`: reset code TTL (default `10`)

Mail/SMTP variables:

- `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`
- `MAIL_USER`, `MAIL_PASS`
- `MAIL_FROM`

If SMTP is not fully configured, backend falls back to log-preview mode for emails.
Email HTML is rendered with Handlebars templates in `src/mail/templates`.

MinIO/S3 variables:

- `S3_ENDPOINT`, `S3_PORT`, `S3_USE_SSL`
- `S3_ACCESS_KEY`, `S3_SECRET_KEY`
- `S3_REGION`
- `S3_INIT_BUCKETS` (`true`/`false`): auto-create configured buckets on startup
- `S3_BUCKET_BLOG_IMAGES`, `S3_BUCKET_AVATARS`, `S3_BUCKET_PUBLIC`, `S3_BUCKET_PRODUCTS`, `S3_BUCKET_TICKETS`
- `S3_PUBLIC_URL`

## Security Notes

- The app now rejects insecure placeholder JWT secrets outside `NODE_ENV=test`.
- Keep `.env` out of source control (already ignored by `.gitignore`).
- Use strong, unique JWT secrets in every environment.

## Test & Lint

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Lint (auto-fix)
npm run lint
```

## Seeder / Utility Scripts

From `package.json`:

- `npm run migrate:role-user-to-author`
- `npm run migrate:post-content-to-blocks`
- `npm run seed:technology-posts`
