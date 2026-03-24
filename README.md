# Web Project API

NestJS backend for auth, users, blog, wallet, subscriptions, notifications, store MVP (products + orders), cart checkout, and PayOS-backed deposits on MongoDB. It also uses MinIO or another S3-compatible store, SMTP email, and Swagger.

## What Is Implemented

- Auth: register, login, refresh token, logout, email verification, forgot/reset password.
- Users: current profile, avatar upload, admin user management.
- Blog: categories, tags, posts, moderation, comments, likes, bookmarks, poll voting, view tracking.
- Wallet: balance, transactions, deposit requests, PayOS webhook/return callbacks, admin adjustments.
- Subscriptions: canonical `free`, `pro`, `vip` plans; monthly, quarterly, yearly billing; wallet-coin purchase; auto-renew with grace period.
- Notifications: minimal in-app feed for subscription events.
- Store MVP: products CRUD/listing, direct order creation (`buy-now`), and order lookup.
- Store operations MVP: store order list and dashboard summary for staff/admin.
- Reviews MVP: product/store review create/list and staff/admin reply.
- Cart MVP: get/add/update/remove/clear/checkout with checkout revalidation.
- Health + Ops alerting: liveness/readiness endpoints with alert hooks for readiness, webhook, and renewal outcomes.
- Infra: MongoDB, MinIO bucket bootstrap, SMTP mail preview or delivery, global validation/response/error handling, hourly scheduler for subscription renewal.

## Planned (Not Implemented Yet)

- Tickets module and admin ticket flows.
- Wiki/knowledge-base module.
- Gamification/social modules.
- Store quote/delivery and advanced fulfillment flows.
- Admin dashboard/audit-log endpoints and `GET /admin/wallet/stats`.
- WebSocket/Bull realtime and queue-based flows.

## Current Subscription Behavior

- Plans are `free`, `pro`, and `vip`.
- Billing cycles are `monthly`, `quarterly`, and `yearly`.
- Subscription purchase is charged from the wallet coin balance.
- Auto-renew runs hourly, sends 7-day and 3-day reminders, retries renewal at expiry, and gives a 3-day grace window on insufficient coins.
- Legacy `months` input is still accepted for backward compatibility.
- Legacy plan codes `starter` and `elite` are mapped to `pro` and `vip`.
- History is derived from wallet transactions with `type = subscription`.

## Requirements

- Node.js 20+
- npm 10+
- MongoDB
- MinIO or another S3-compatible object storage
- SMTP account if you want real email delivery
- PayOS credentials for wallet deposits and payment callbacks

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
- `COIN_TO_VND_RATE`, `POST_REWARD_COINS`
- `DEPOSIT_FRAUD_WINDOW_MINUTES`, `DEPOSIT_FRAUD_THRESHOLD`, `DEPOSIT_FAILURE_WINDOW_MINUTES`
- `SUBSCRIPTION_GRACE_DAYS`
- `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`
- `PAYOS_ENDPOINT`, `PAYOS_PAYMENT_BASE_URL`, `PAYOS_RETURN_URL`, `PAYOS_CANCEL_URL`, `PAYOS_WEBHOOK_URL`, `PAYOS_CURRENCY`

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
- `npm run migrate:wallet-transaction-units`
- `npm run migrate:subscription-tier-v2`
- `npm run seed:technology-posts`

## API Summary

### Public

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/verify-email`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `POST /auth/refresh`
- `GET /health/live`
- `GET /health/ready`
- `GET /posts`
- `GET /posts/:slug`
- `GET /posts/:postId/poll/results`
- `GET /posts/:postId/comments`
- `GET /categories`
- `GET /tags`
- `GET /tags/:slug/posts`
- `GET /products`
- `GET /products/:identifier` (id or slug)
- `GET /subscriptions/plans`
- `POST /payment/payos/webhook`
- `POST /payment/callback/payos`
- `POST /payment/payos/return-sync`
- `GET /payment/payos/return-status`

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
- `GET /wallet/balance`
- `GET /wallet/me`
- `GET /wallet/transactions`
- `GET /wallet/me/transactions`
- `POST /wallet/deposit`
- `POST /wallet/deposit-requests`
- `GET /wallet/deposit/:id`
- `GET /wallet/deposit-requests/:id`
- `POST /wallet/deposit/:id/cancel`
- `POST /wallet/deposit-requests/:id/cancel`
- `GET /subscriptions/me`
- `POST /subscriptions/me/purchase`
- `POST /subscriptions/me/renew`
- `POST /subscriptions/me/auto-renew`
- `POST /subscriptions/me/cancel-at-period-end`
- `GET /subscriptions/me/history`
- `GET /notifications/me`
- `GET /notifications/me/unread-count`
- `POST /notifications/me/:id/read`
- `POST /notifications/me/read-all`
- `POST /orders`
- `GET /orders/me`
- `GET /orders/:id`
- `GET /cart`
- `POST /cart/items`
- `PATCH /cart/items/:itemId`
- `DELETE /cart/items/:itemId`
- `DELETE /cart`
- `POST /cart/checkout`
- `GET /products/:productId/reviews`
- `POST /products/:productId/reviews`
- `GET /store/reviews`
- `POST /store/reviews`

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
- `GET /products/me`
- `POST /products`
- `PATCH /products/:id`
- `DELETE /products/:id`
- `PATCH /reviews/:id/reply`
- `GET /store/orders`
- `GET /store/dashboard`
- `POST /admin/wallet/adjust`

Auth uses bearer JWT. Public routes do not require a token.

## Env Notes

- `S3_ENDPOINT` can be a host name or a full `http(s)://...` URL. The app parses both.
- If SMTP is not fully configured, mail sending falls back to log preview mode.
- If `S3_INIT_BUCKETS=true` and storage credentials are present, the app tries to create the configured buckets on startup.
- `SUBSCRIPTION_GRACE_DAYS` defaults to `3` when omitted.
- `PAYOS_RETURN_URL`, `PAYOS_CANCEL_URL`, and `PAYOS_WEBHOOK_URL` should point to your frontend or public callback endpoints.
- In this workspace, `.env` is already pointed at remote MongoDB and S3/SMTP values. Replace them before running locally or committing changes.

## Validation

Verified on `2026-03-24`:

```bash
npm run build
npm test -- --runInBand
```
