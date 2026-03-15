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

### Phase 1 - Foundation (Q2/2026)

- Auth, RBAC, blog workflow, digital store baseline, wallet core.
- Ticket core and basic notifications.

### Phase 2 - Growth (Q3/2026)

- Full custom order lifecycle.
- Leaderboard, badges/achievements, advanced profile.
- Review/rating and anti-fraud improvements.

### Phase 3 - Monetization (Q4/2026)

- Subscription tiers (VIP perks).
- Expanded payment features (VNPay, MoMo, Stripe).
- Advanced seller analytics dashboard.

### Phase 4 - Ecosystem (Q1/2027)

- Knowledge base / Wiki.
- Poll/Vote on blog posts.
- Public API and partner integrations.

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
