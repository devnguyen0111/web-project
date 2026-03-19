# Project Documentation

# Personal Website - Full-Stack Platform

> **Author:** DevNguyen0111
> **Created:** 2026-03-09
> **Updated:** 2026-03-19
> **Version:** 1.3
> **Status:** Backend docs aligned with implemented wallet, subscription, PayOS, and notification features

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Implemented Features](#3-implemented-features)
4. [Data Model](#4-data-model)
5. [API Endpoints](#5-api-endpoints)
6. [Project Structure](#6-project-structure)
7. [Delivery Status](#7-delivery-status)
8. [Key Flows](#8-key-flows)
9. [Security](#9-security)
10. [Changelog](#10-changelog)

---

## 1. Project Overview

This repository is the backend for a personal platform with auth, blog, wallet, subscription, notification, and admin workflows.

The current backend focus is:

- Wallet coin deposits and internal coin spending
- Subscription purchase through wallet coins
- Hourly auto-renew with reminders and grace period handling
- Minimal in-app notifications for subscription events
- Canonical subscription APIs with legacy compatibility
- PayOS-based top-up and payment callback flow

The wider product design also covers store, tickets, knowledge base, gamification, and admin dashboards. This document keeps those domains in the architecture view, but the subscription revamp scope in this round is quota-first.

---

## 2. Tech Stack

| Layer | Technology | Purpose |
| --- | --- | --- |
| Backend | NestJS 11 + TypeScript | REST API, modular architecture |
| Database | MongoDB + Mongoose 9 | Document storage |
| Storage | MinIO / S3-compatible storage | Files and images |
| Mail | Nodemailer | Transactional email and preview mode |
| Payments | PayOS | Wallet deposits and subscription top-ups |
| Scheduler | `@nestjs/schedule` | Hourly subscription renewal job |
| API Docs | Swagger (`@nestjs/swagger`) | Auto-generated API docs |
| Validation | `class-validator` + `class-transformer` | DTO validation |
| Testing | Jest | Unit and E2E tests |
| Planned but not enabled | Redis, Bull, Socket.io | Future queue and realtime work |

Current runtime uses MongoDB, MinIO, SMTP, PayOS, and the scheduler. Redis, Bull, and WebSocket infrastructure are documented in the product roadmap but are not enabled in this codebase.

---

## 3. Implemented Features

### 3.1 Auth and Users

- Register, login, refresh token, logout
- Email verification and password reset
- Current user profile and avatar upload
- Role-based admin management
- JWT guards and role guards

### 3.2 Blog

- Categories, tags, posts, moderation, comments
- Likes, bookmarks, poll voting, and view tracking
- Moderation queue with approve and reject actions
- Reward flow for approved posts

### 3.3 Wallet and PayOS

- Wallet balance and transaction history
- Deposit requests with PayOS payment links
- Webhook and return-sync callbacks for payment status
- Deposit cancellation flow
- Fraud flags and idempotency support
- Admin wallet adjustment

### 3.4 Subscription Revamp

- Plan codes: `free`, `pro`, `vip`
- Billing cycles: `monthly`, `quarterly`, `yearly`
- Purchase and renewal through wallet coins
- Legacy compatibility for `starter`, `elite`, and `months` input
- Auto-renew support with reminders and grace handling
- Canonical APIs under `/subscriptions/me`
- History derived from wallet transactions with `type = subscription`
- Non-quota perks are exposed in data and UI, but enforcement for those perks is still treated as `Coming soon`

### 3.5 Notifications

- Minimal in-app notification feed for subscription events only
- Read, read-all, and unread-count actions
- Email alerts for reminder, renewed, failed, and expired events
- No WebSocket notification pipeline is enabled yet

### 3.6 Broader Product Modules

- Store, tickets, knowledge base, gamification, and admin dashboards remain part of the broader product design
- Keep those domains in the architecture notes, but do not describe them as part of the subscription revamp scope unless the code path is verified

---

## 4. Data Model

### Core Collections

| # | Collection | Scope | Description |
| --- | --- | --- | --- |
| 1 | `users` | Core | Account, role, wallet, subscription, gamification |
| 2 | `transactions` | Finance | All coin transactions, including deposits and subscription purchases |
| 3 | `subscriptions` | Finance | Subscription history and normalized subscription snapshots |
| 4 | `notifications` | System | Subscription notification feed |
| 5 | `posts` | Blog | Articles, moderation, engagement, poll |
| 6 | `categories` | Shared | Categories for blog, store, and wiki |
| 7 | `tags` | Blog | Tags with usage count |
| 8 | `audit_logs` | System | Important operational actions |

### 4.1 User Document

```ts
{
  _id: ObjectId,
  username: string,
  email: string,
  password: string,
  displayName: string,
  avatar: string,
  bio: string,
  website: string,
  socialLinks: { github, twitter, linkedin },

  role: "guest" | "author" | "staff" | "admin",
  permissions: string[],

  wallet: {
    balance: number,
    frozenBalance: number,
    totalEarned: number,
    totalSpent: number,
    lifetimeDeposit: number
  },

  subscription: {
    planCode: "free" | "pro" | "vip",
    planName: string,
    basePostLimit: number,
    extraPosts: number,
    monthlyPriceCoins: number,
    billingCycle: "monthly" | "quarterly" | "yearly",
    autoRenew: boolean,
    cancelAtPeriodEnd: boolean,
    status: "active" | "expired",
    startedAt: Date,
    expiresAt?: Date,
    currentPeriodStart: Date,
    currentPeriodEnd: Date,
    postsUsedInPeriod: number,
    renewedAt: Date,
    nextRenewalAt?: Date,
    renewalFailedAt?: Date,
    gracePeriodEndsAt?: Date,
    reminder7dSentAt?: Date,
    reminder3dSentAt?: Date
  },

  level: number,
  xp: number,
  xpToNextLevel: number,
  createdAt: Date,
  updatedAt: Date
}
```

### 4.2 Transaction Document

- `type` includes `deposit`, `purchase`, `subscription`, `sale_income`, `post_reward`, `referral_bonus`, `refund_buyer`, `refund_store`, `platform_fee`, `admin_adjust`, and `withdrawal`
- `status` includes `pending`, `completed`, `failed`, and `reversed`
- Subscription transaction metadata stores `planCode`, `billingCycle`, `months`, `totalCostCoins`, `totalCostAmount`, and `coinToVndRate`

### 4.3 Notification Document

- `category` is currently subscription only
- `type` includes `subscription_reminder`, `subscription_renewed`, `subscription_failed`, and `subscription_expired`
- Fields include `title`, `message`, `readAt`, and `metadata`

### 4.4 Subscription Document

- Mirrors the subscription subdocument on the user record
- Stores billing cycle, renewal state, reminder timestamps, and grace window timestamps
- Normalization logic maps legacy plan codes to the canonical values

---

## 5. API Endpoints

### 5.1 Public

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
- `GET /subscriptions/plans`
- `POST /payment/payos/webhook`
- `POST /payment/callback/payos`
- `POST /payment/payos/return-sync`
- `GET /payment/payos/return-status`

### 5.2 Authenticated

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

### 5.3 Staff and Admin

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
- `POST /admin/wallet/adjust`
- `GET /admin/wallet/stats`

Auth uses bearer JWT. Public routes do not require a token.

---

## 6. Project Structure

```text
web-project/
|-- .env
|-- .env.example
|-- package.json
|-- test/
`-- src/
    |-- app.module.ts
    |-- auth/
    |-- blog/
    |-- common/
    |-- config/
    |   |-- app.config.ts
    |   |-- database.config.ts
    |   |-- jwt.config.ts
    |   |-- mail.config.ts
    |   |-- minio.config.ts
    |   `-- wallet.config.ts
    |-- database/
    |   `-- seeders/
    |-- mail/
    |-- minio/
    |-- notifications/
    |-- subscriptions/
    |-- users/
    `-- wallet/
        |-- payment.controller.ts
        |-- wallet.controller.ts
        |-- wallet.service.ts
        |-- providers/
        `-- schemas/
```

There is no `jobs/` directory in the current codebase. Subscription renewal is scheduled directly in the subscription service through `@nestjs/schedule`.

---

## 7. Delivery Status

### Implemented in this backend

- Wallet coin balance, deposit, and transaction history
- PayOS payment provider integration
- Subscription plans `free`, `pro`, and `vip`
- Monthly, quarterly, and yearly billing
- Wallet-coin purchase and auto-renew flow
- Hourly renewal cron with 7-day and 3-day reminders
- Grace period handling for failed renewals
- Subscription notification feed and email alerts
- Migration script for legacy subscription tiers

### Backlog or planned work

- Redis and Bull queue infrastructure
- WebSocket notification pipeline
- Non-quota subscription perk enforcement
- Any product areas outside the current subscription and wallet revamp scope

### Validation

Backend build and tests were verified on `2026-03-19`.

---

## 8. Key Flows

### 8.1 Wallet Deposit

```text
User creates a deposit request
  -> POST /wallet/deposit or /wallet/deposit-requests
PayOS returns a checkout URL
  -> user completes payment
PayOS webhook or return-sync updates the transaction
  -> completed deposit increases wallet balance
```

### 8.2 Subscription Purchase

```text
User selects a plan and cycle
  -> GET /subscriptions/plans
Wallet balance is checked
  -> if sufficient, charge coins and create subscription transaction
  -> if insufficient, prompt top-up
User subscription is updated
  -> plan, billing cycle, renewal timestamps, and quota state are saved
```

### 8.3 Auto-Renew

```text
Hourly cron scans paid subscriptions
  -> send reminders at T-7 and T-3
  -> attempt renewal at expiry
If wallet balance is insufficient
  -> mark renewal failed
  -> start a 3-day grace period
If grace expires without renewal
  -> downgrade to Free
```

### 8.4 Subscription History

```text
GET /subscriptions/me/history
  -> derive entries from wallet transactions where type = subscription
  -> return normalized metadata for plan, billing cycle, and cost
```

---

## 9. Security

### 9.1 Authentication

- JWT access tokens and refresh tokens
- Refresh token rotation
- Email verification and password reset flows
- Optional 2FA endpoints in auth

### 9.2 Authorization

- Role-based access control
- Ownership checks for user-scoped resources
- Global JWT and role guards

### 9.3 Wallet and Subscription Safety

- MongoDB transactions for money mutations
- Idempotency keys for deposits and subscription charges
- PayOS payload verification and webhook handling
- Balance snapshots before and after every transaction
- Grace period and renewal failure timestamps persisted on the subscription document

### 9.4 API and Data Protection

- DTO validation with `class-validator`
- MongoDB schema validation
- Sanitized email preview mode when SMTP is not configured
- Presigned URLs for protected file access
- Audit logs for sensitive administrative actions

---

## 10. Changelog

| Date | Version | Changes |
| --- | --- | --- |
| 2026-03-09 | 1.0 | Initial documentation |
| 2026-03-15 | 1.1 | Store switched to single-seller mode |
| 2026-03-18 | 1.2 | Wallet and transaction schema updates, PayOS set as primary payment provider |
| 2026-03-19 | 1.3 | Subscription revamp, auto-renew scheduler, and notifications docs aligned with code |

---

> Note: This document is the backend reference for the current codebase. When implementation changes, update the doc in the same commit.
