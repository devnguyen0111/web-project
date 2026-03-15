# Web Project Platform

A unified community platform that combines a Blog System, Digital Store, Ticket Support, Wallet/Coin Economy, and Social/Gamification features to deliver high-quality content, trusted transactions, and long-term user engagement.

---

## 1) Title & Description

Web Project Platform is a multi-module system where users can publish blogs, sell digital products, get support via tickets, transact with internal coins, and participate in a social ecosystem.

Core goals:

- Provide a structured editorial workflow (Draft -> Review -> Publish).
- Build a marketplace for digital products and custom orders.
- Maintain a transparent coin economy for rewards and spending.
- Increase engagement through badges, leaderboards, and real-time notifications.

---

## 2) Introduction

This project addresses the need for an all-in-one product platform:

- Content: editorial-quality publishing workflow.
- Commerce: digital product sales, custom orders, and full order lifecycle tracking.
- Support: order-linked and general-purpose ticket handling.
- Economy: coin wallet, gateway top-up, and complete transaction history.
- Trust & Retention: rating/review, subscription tiers, 2FA, achievements.

This README follows a production-grade documentation style used by large-scale projects: clear, consistent, onboarding-friendly, and scalable.

---

## 3) Key Features

### Blog System

- Markdown/Rich text editor support.
- Role-based access: Admin, Staff, Author, Guest.
- Review queue: Draft -> Pending Review -> Published / Rejected.
- Tags, categories, and full-text search.
- Comment system (integrated provider or custom implementation).

### Store

- Digital product listing: file upload, preview, description, coin-based pricing.
- Custom order flow: request form -> quotation -> payment -> delivery.
- Order statuses: Pending -> Processing -> Delivered -> Completed.
- Seller dashboard: revenue, orders, products.

### Ticket Support

- Create tickets linked to orders or as standalone support tickets.
- Priority levels: Low / Medium / High / Urgent.
- Status workflow: Open -> In Progress -> Resolved -> Closed.
- Staff assignment and internal notes.

### Wallet & Coin System

- One coin wallet per user.
- Coin top-up via VNPay, MoMo, Stripe (configurable).
- Coin rewards for approved posts.
- Coin spending in store purchases.
- Full transaction ledger with anti-fraud controls.

### Gamification & Social

- Badge/Achievement milestones.
- Profile page: portfolio, posts, rank, badges.
- Real-time notification system (WebSocket).
- Leaderboards: top contributors and top buyers.

### Monetization & Trust

- Product and seller ratings/reviews.
- Subscription tiers (VIP perks).
- 2FA for coin-enabled accounts.

### Content Expansion

- Knowledge base / Wiki.
- Poll/Vote on blog posts.

---

## 4) Architecture Overview

Recommended architecture is domain-modular and scalability-oriented:

```mermaid
flowchart LR
    C[Client Web App\nNext.js/React] --> G[API Gateway / BFF]
    G --> A[Auth & IAM]
    G --> B[Blog Service]
    G --> S[Store Service]
    G --> T[Ticket Service]
    G --> W[Wallet Service]
    G --> N[Notification Service]
    G --> R[Review & Rating Service]
    G --> K[Knowledge Base Service]

    B --> DB[(PostgreSQL)]
    S --> DB
    T --> DB
    W --> DB
    R --> DB
    K --> DB

    B --> ES[(Search Engine)]
    N --> WS[WebSocket Gateway]
    W --> PG[Payment Gateway\nVNPay/MoMo/Stripe]
    S --> OBJ[(Object Storage)]
```

### Core Business Workflows

```mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> PendingReview: Submit
    PendingReview --> Published: Approve
    PendingReview --> Rejected: Reject
    Rejected --> Draft: Revise
```

```mermaid
stateDiagram-v2
    [*] --> Pending
    Pending --> Processing: Accept Order
    Processing --> Delivered: Send Product
    Delivered --> Completed: Buyer Confirms
```

```mermaid
stateDiagram-v2
    [*] --> Open
    Open --> InProgress: Assign Staff
    InProgress --> Resolved: Fix/Answer
    Resolved --> Closed: Confirmed
```

### Design Principles

- Domain-first module boundaries (Blog, Store, Wallet, Ticket).
- Event-driven async processing (notifications, coin rewards).
- Idempotent payment handling and webhook verification.
- Audit logs for sensitive actions (coins, role updates, order status changes).

---

## 5) Installation

### System Requirements

- Node.js >= 20.x
- Package manager: pnpm (recommended) or npm
- PostgreSQL >= 14
- Redis >= 7 (cache, queue, rate limiting)

### Install Dependencies

```bash
# pnpm
pnpm install

# or npm
npm install
```

---

## 6) Run the Project

```bash
# Development
pnpm dev

# Build
pnpm build

# Production
pnpm start
```

Example local endpoints:

- App: http://localhost:3000
- API: http://localhost:4000
- WebSocket: ws://localhost:4001

---

## 7) Environment Configuration

Create your env file from the template:

```bash
cp .env.example .env
```

Example environment variables:

```env
# App
NODE_ENV=development
APP_URL=http://localhost:3000
API_URL=http://localhost:4000

# Database
DATABASE_URL=postgres://postgres:postgres@localhost:5432/web_project
REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET=replace_with_secure_random_string
JWT_EXPIRES_IN=7d

# Storage
STORAGE_PROVIDER=s3
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=web-project-assets
S3_ACCESS_KEY=your_access_key
S3_SECRET_KEY=your_secret_key

# Payments
PAYMENT_PROVIDER=stripe
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
MOMO_PARTNER_CODE=your_partner_code
VNPAY_TMN_CODE=your_tmn_code

# Realtime
WS_PORT=4001

# Security
TWO_FA_ISSUER=WebProject
RATE_LIMIT_PER_MINUTE=120
```

Security recommendations:

- Do not commit .env files.
- Use a secret manager in production.
- Rotate payment, webhook, and JWT keys regularly.

---

## 8) Folder Structure

```text
web-project/
  apps/
    web/                    # Frontend app
    api/                    # Backend API
    worker/                 # Queue workers (email, notification, reward)
  packages/
    ui/                     # Shared UI components
    config/                 # ESLint, TSConfig, shared constants
    types/                  # Shared type definitions
  services/
    blog/
    store/
    wallet/
    ticket/
    notification/
  docs/
    architecture/
    api/
    adr/                    # Architecture Decision Records
  scripts/
    seed/
    migrate/
  tests/
    e2e/
    integration/
  .env.example
  README.md
```

---

## 9) Contributing Guide

Contributions are welcome.

### Standard Workflow

1. Fork the repository and create a branch from master.
2. Use clear branch names: feat/blog-review-queue, fix/wallet-transaction-race.
3. Follow Conventional Commits:
   - feat: add seller revenue aggregation
   - fix: validate payment webhook signature
4. Add or update relevant tests.
5. Open a Pull Request with:
   - Problem statement
   - Solution details
   - Test evidence
   - Rollback plan (if production-impacting)

### Coding Standards

- Prefer clean architecture and strict domain boundaries.
- Never hardcode secrets.
- Require logging for payments, wallet operations, and permission checks.
- Do not merge critical logic changes without test coverage.

---

## 10) License

No official license has been published yet.

- For internal enterprise usage: use UNLICENSED.
- For open-source distribution: MIT or Apache-2.0 are recommended depending on legal strategy.

Example if MIT is selected, add a LICENSE file at project root:

```text
MIT License
Copyright (c) 2026 ...
```

---

## 11) Roadmap

Implementation is split into 6 phases, designed for fast backend delivery with production-safe milestones.

```mermaid
gantt
    title Delivery Plan (6 Phases)
    dateFormat  YYYY-MM-DD
    section Core Platform
    Phase 1 Foundation           :p1, 2026-03-16, 8d
    Phase 2 Blog System          :p2, after p1, 6d
    section Economy & Commerce
    Phase 3 Wallet and Payment   :p3, after p2, 10d
    Phase 4 Store and Orders     :p4, after p3, 7d
    section Experience
    Phase 5 Support and Realtime :p5, after p4, 6d
    Phase 6 Gamification Polish  :p6, after p5, 8d
```

### Phase 1 - Foundation (7-8 days)

Goal: Run the server successfully with registration/login and baseline CRUD.

Week 1-2 scope:

- Setup project
  - NestJS + MongoDB + Redis
  - Docker Compose (mongo + redis)
  - Config module (.env)
  - Swagger setup
  - Common layers (guards, filters, interceptors, pipes)
- Auth module
  - Register + password hashing
  - Login + JWT access/refresh tokens
  - Refresh token rotation
  - Logout (token blacklist)
  - Basic email verification
- Users module
  - User schema
  - Get/Update profile
  - Role system (user/staff/admin)
- Upload module (basic)
  - Image upload to S3/Cloudinary

Phase 1 outcome: Registration, login, and JWT auth are operational. Swagger docs are available.

### Phase 2 - Blog System (5-6 days)

Goal: End-to-end blog publishing flow with moderation and comments.

Week 3 scope:

- Categories
  - Admin CRUD
- Posts
  - Create draft
  - Update/Delete own post
  - Submit for review (draft -> pending)
  - Public listing (published only, pagination)
  - Get by slug (increment view count)
  - Like/Bookmark toggle
  - My posts (all statuses)
- Moderation
  - Get pending posts (staff/admin)
  - Approve -> published
  - Reject with reason -> rejected
- Comments
  - List comments by post
  - Create comment (nested replies)
  - Edit/Delete own comment
  - Like comment

Phase 2 outcome: Fully working blog module with post moderation workflow.

### Phase 3 - Wallet and Payment (8-10 days)

Goal: Production-ready coin economy and real-money top-up flow.

Week 4-5 scope:

- Wallet core
  - Transaction schema
  - Get balance
  - Transaction history (filter + pagination)
  - Internal atomic transfer logic with MongoDB sessions
    - purchase() for coin deduction
    - reward() for coin addition
    - refund() for coin refund
  - Admin manual adjust (credit/debit)
- Payment integration
  - VNPay provider
    - Create payment URL
    - Verify IPN callback
    - Credit coins after successful verification
  - MoMo provider (same flow)
- Blog reward
  - Auto-credit coin when post is approved
- Wallet testing (critical)
  - Concurrent transaction tests
  - Insufficient balance tests
  - Payment callback security tests

Phase 3 outcome: Users can top up coins with real money and spend coins safely.

Important note: This is the most critical phase. A small wallet or callback bug can directly cause financial loss.

### Phase 4 - Store and Orders (6-7 days)

Goal: Enable coin-based buying/selling for digital products and custom orders.

Week 5-6 scope:

- Products
  - Admin CRUD
  - Digital product upload
  - Custom order with dynamic fields
  - Public listing + search + filter
  - Sale pricing
- Orders
  - Create order -> freeze coin -> confirm -> deduct
  - Digital order: auto-deliver download link after payment
  - Custom order: admin processing -> upload delivery -> delivered
  - Buyer confirm completion
  - Cancel flow
  - Refund request flow
  - Status history tracking
  - Auto-complete cron (7 days)
- Reviews
  - Create review (verified purchase only)
  - Admin reply
  - Update product rating aggregate
- Secure file download
  - Presigned URL (only verified buyers can download)

Phase 4 outcome: Store is fully operational with coin-based purchase and delivery flows.

### Phase 5 - Support and Realtime (5-6 days)

Goal: Deliver support operations and real-time user communication.

Week 7 scope:

- Tickets
  - Create ticket (optional order link)
  - Send message + attachment
  - Staff assignment, internal notes, status transitions
  - Close/Reopen
  - Satisfaction rating
  - Ticket listing + filters
- Notifications
  - Notification schema + CRUD
  - Event-driven creation from:
    - Post approved/rejected
    - Order status changed
    - Ticket reply
    - Wallet deposit success
    - New follower
  - Mark as read / mark all as read
  - WebSocket gateway for real-time push
- Mail
  - Email templates (Handlebars)
  - Async sending via Bull queue
  - Verify email, reset password, order confirmation

Phase 5 outcome: Support workflows and real-time notifications are available to end users.

### Phase 6 - Gamification and Polish (6-8 days)

Goal: Improve retention, admin observability, and release readiness.

Week 8-9 scope:

- Gamification
  - XP system (addXp, level-up checks)
  - Badge auto-award
  - Daily missions (progress tracking, reward claim)
  - Referral system (code, tracking, reward)
  - Leaderboard
- Social
  - Follow/Unfollow
  - Public profile (posts, badges, level)
  - User search
- Admin Dashboard
  - Overview stats (users, orders, revenue, posts)
  - Revenue chart data
  - User management (ban/unban, role changes)
  - System health
- Cron Jobs
  - Auto-complete orders (7 days)
  - Reset daily missions (00:00)
  - Cleanup expired tokens
  - Update leaderboard cache
- Polish
  - Rate limiting fine-tuning
  - Input sanitization review
  - Error handling review
  - Complete API documentation
  - Seed data (admin, categories, badges, missions)

Phase 6 outcome: Feature-complete platform, ready for frontend integration and release hardening.

---

## Quick Examples

### Example: Create a new post

1. Author creates a post in Draft.
2. Author submits for review -> Pending Review.
3. Staff reviews:
   - Approved -> Published
   - Rejected -> Rejected with feedback

### Example: Buy a digital product with coins

1. User tops up coins via payment gateway.
2. User selects a digital product in the store.
3. Wallet deducts coins; order moves to Processing.
4. Seller delivers the file -> Delivered.
5. Buyer confirms -> Completed.

### Example: Open order-linked support ticket

1. User opens a ticket from the order detail page.
2. Priority is set and staff is assigned.
3. Staff handles the case with internal notes.
4. Ticket is closed after user confirms resolution.

---

## Related Docs (Recommended)

- docs/architecture/system-overview.md
- docs/api/openapi.yaml
- docs/adr/0001-domain-boundaries.md

If needed, this README can be expanded into:

- Product Requirements Document (PRD)
- Software Architecture Document (SAD)
- API Contract (OpenAPI)
- Operations Runbook (monitoring, backup, incident response)
