# 📋 PROJECT DOCUMENTATION

# Personal Website — Full-Stack Platform

> **Author:** DevNguyen0111
> **Created:** 2026-03-09
> **Version:** 1.6
> **Status:** Phase 2-5 Delivered, Phase 6 In Progress (Phase 1 still has infra backlog: Docker Compose)

---

## 📑 Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Features Detail](#3-features-detail)
4. [Database Design](#4-database-design)
5. [API Endpoints](#5-api-endpoints)
6. [Project Structure](#6-project-structure)
7. [Phase Plan](#7-phase-plan)
8. [Flow Diagrams](#8-flow-diagrams)
9. [Security](#9-security)
10. [Frontend Readiness](#10-frontend-readiness)

---

## 1. Project Overview

Multi-functional personal website includes:

- **Blog** with review system
- **Store** sells digital products + custom orders (single-seller)
- **Ticket** customer support
- **Wallet** internal coin system
- **Gamification** XP/Level/Badge
- **Knowledge Base** instruction manual
- **Subscription** VIP package

---

## 2. Tech Stack

| Layers | Technology | Purpose |
| ---------- | ----------------------------------- | ------------------------------ |
| Frontend   | Next.js 16.1.6 + React 19 (App Router) | SSR/SSG, SEO, Dashboard     |
| Backend    | NestJS 11 + TypeScript              | REST API, modular architecture |
| Database   | MongoDB + Mongoose 9                | Document storage               |
| Cache      | Redis 7+                            | Session, distributed lock, multi-instance WS adapter (planned) |
| Queue      | Bull (@nestjs/bull)                 | Email, async jobs (planned)    |
| WebSocket  | Socket.io (@nestjs/websockets)      | Realtime notifications + tickets conversation (implemented, single-instance) |
| Storage    | AWS S3 / Cloudinary                 | Files, images                  |
| Auth       | JWT + Refresh Token + 2FA (TOTP)    | Authentication                 |
| Payment    | PayOS (primary)                      | Deposit coins                  |
| Email      | Nodemailer (@nestjs-modules/mailer) | Transactional email            |
| API Docs   | Swagger (@nestjs/swagger)           | Auto-generated docs            |
| Validation | class-validator + class-transformer | Input validation               |
| Testing    | Jest                                | Unit + E2E tests               |

> Current status note (2026-03-26): Auth now supports step-up 2FA (TOTP + backup codes), Notifications + Tickets include Socket.IO realtime, Tickets have role-sensitive operation policy + auto-assign, Store buyer/staff order actions are surfaced in FE, and public Wiki FE list/detail/helpful vote is live. Redis/Bull queue remains roadmap.

---

## 3. Features Detail

### 3.1 📝 Blog System

- Editor supports Markdown and Rich text
- **Roles:** Admin, Staff (review articles), Author, Guest
- **Moderation queue:** Draft → Pending Review → Published / Rejected
- Author edits rejected article → resubmits
- Tag system (separate collection, usage count)
- Category system (nested, multi-scope)
- Full-text search (title + content)
- Comment system: nested reply (max depth 3), likes, staff can hide comments
- **Poll/Vote** embedded in blog post
- Exclusive content (only VIP views)
- SEO metadata (metaTitle, metaDescription, canonicalUrl)
- **Coin reward** when the article is approved (VIP receives bonus multiplier)

### 3.2 🛒 Store

- **Digital products:** Upload file, preview, description, price (coin)
- **Custom orders:** Request form → Staff/Admin quote → Buyer accepts → Payment → Delivery
- **Single-seller:** Only Admin posts products for sale; Operations management staff (orders, quotes, care)
- Subscriber discount (Pro/VIP discount %)
- Product moderation (pending_review before activating)
- Platform fee per transaction
- Review/Rating with aspect scores (quality, delivery, communication)
- Staff/Admin reply cho reviews
- Auto-complete orders after 7 days of delivery

### 3.3 🎫 Ticket Support

- Create tickets linked to orders, products, wallets, and accounts
- **Priority:** Low / Medium / High / Urgent
- **Status:** Open → Awaiting User → In Progress → Escalated → Resolved → Closed
- **Realtime:** Socket.IO namespace `/tickets` for message + ticket status push
- **Auto-assign:** seller-first (order-linked) → least-load active staff/admin fallback
- Staff assignment + escalation
- **Role policy:**
  - Admin: full read/write/assign/status override
  - Staff: read assigned+unassigned, claim only unassigned to self, write/status/internal-note only when assigned to self
- Internal notes (buyer does not see)
- System auto messages (status changed, assigned)
- Reply/internal-note attachments via `/upload/attachment`
- **SLA tracking:** First response due, resolution due
- Satisfaction rating (1-5) after resolution

### 3.4 💰 Wallet & Coin System

- Each user has a wallet: balance, frozenBalance, totalEarned, totalSpent
- **Deposit coins:** PayOS → deposit_requests → verify → add coins
- **Receive coins:** Approved articles, completed sales settlement, admin adjustments
- **Spending coins:** Buy goods, buy subscriptions
- **Admin (store owner) receives coin:** sale_income (after order is completed, minus platform fee)
- **Admin withdrawal:** withdrawal flow (roadmap)
- Full transaction history (balanceBefore/After)
- **Anti-fraud:** IP tracking, user agent, flagged transactions
- MongoDB transaction (session) for all wallet operations

### 3.5 🏅 Gamification

- **XP/Level system:** Get XP when active, auto level up
- **Badges (MVP):** first-post, content-writer, first-sale, trusted-seller, level milestones
- Badge conditions: `posts_published`, `sales_count`, `level_reached`
- Badge rewards: XP (notification `badge_earned`)
- **Leaderboard:** users sorted by XP/level/sales (API live)
- Pre-computed leaderboard snapshots (cron job: alltime/weekly/monthly)

### 3.6 👤 Social

- Profile page: portfolio, articles, rank, badges
- Follow/Unfollow system
- Follower/Following counts

### 3.7 💳 Subscription

- **Tiers:** Free / Pro / VIP
- **Billing:** Monthly / Quarterly / Yearly
- **Perks (current scope):**
  - Monthly post quota (enforced)
  - Extra coin reward (% bonus when writing articles) (coming soon)
  - Store discount (%) (coming soon)
  - Priority support (coming soon)
  - Custom badge (coming soon)
  - Featured profile (coming soon)
  - Max file upload size increased (coming soon)
  - Access exclusive content (coming soon)
- Auto-renew option
- Subscription history tracking

### 3.8 🔔 Notifications

- **Realtime:** Socket.IO namespace `/notifications` (push-only, JWT handshake auth, single-instance)
- **Types:** subscription, ticket, blog moderation, store order lifecycle, wallet deposit/admin-adjust, badge earned
- **Channels hiện tại:** In-app + WebSocket realtime
- **Email/Push:** roadmap
- From user info (who caused the notification)
- Mark read / read all
- Unread count (HTTP + realtime push)
- TTL cleanup policy 90 days (planned task)

### 3.9 📚 Knowledge Base / Wiki

- Articles with Markdown content
- **Versioning:** Each edit saves changelog (version, editor, summary)
- **Hierarchy:** Parent/child articles, breadcrumb
- Helpful votes (Yes/No)
- Access control: Public / Pro only / VIP only
- Separate wiki categories
- Full-text search
- **Frontend (public) now live:** `/knowledge` list/search/filter + `/knowledge/:slug` detail + helpful vote action for authenticated users

### 3.10 ⭐ Review/Rating

- Review for **product**
- Aspect ratings: quality (1-5), delivery (1-5), communication (1-5)
- Verified purchase badge
- Staff/Admin reply
- Helpful count
- Report system
- Average rating auto-computed on product

### 3.11 🔐 Security & Admin

- **2FA:** TOTP (Google Authenticator) + backup codes + step-up login challenge
- **Audit logs:** Persistent `audit_logs` + global write interceptor (POST/PUT/PATCH/DELETE)
- **Admin dashboard:** Overview stats, revenue chart, user growth (`/admin/dashboard/*`)
- **User management:** Ban/unban, change role, wallet adjust
- Rate limiting (custom in-memory limiter cho auth/payment; ThrottlerModule planned)
- Input sanitization (XSS)
- Refresh token rotation

### 3.12 🧺 Cart

- One active cart per user
- Add/update/remove item, clear cart
- Checkout cart into order
- Re-validate product availability + latest price at checkout
- `custom_order` flow does not use cart (quote flow only)

---

## 4. Database Design

### Collections Overview (23)

| # | Collection | Scope | Description |
| --- | --------------------- | ------------ | --------------------------------------------------- |
| 1 | users | Core | Account, role, wallet, subscription, gamification |
| 2 | subscriptions | Finance | Subscription history |
| 3 | posts | Blog | Articles, moderation, engagement, poll |
| 4 | poll_votes | Blog | User votes |
| 5   | post_comments         | Blog         | Comments nested                                     |
| 6   | categories            | Shared       | Categories cho blog/store/wiki                      |
| 7 | tags | Blog | Tags with usage count |
| 8 | wiki_articles | Wiki | Documentation, versioning |
| 9 | wiki_categories | Wiki | Wiki classification |
| 10 | products | Store | Digital/custom products |
| 11 | orders | Store | Orders |
| 12 | reviews | Store | Product/store reviews |
| 13 | tickets | Support | Support tickets |
| 14 | ticket_messages | Support | Messages in tickets |
| 15 | transactions | Finance | All coin transactions |
| 16 | deposit_requests | Finance | Deposit request |
| 17 | notifications | System | Notice |
| 18  | badges                | Gamification | Badge templates                                     |
| 19 | user_badges | Gamification | Which user got the badge |
| 20 | leaderboard_snapshots | Gamification | Ranking |
| 21 | audit_logs | System | System log |
| 22 | carts | Store | User shopping cart |
| 23 | user_follows | Social | Follow relationships |

---

### 4.1 users

```js
{
  _id: ObjectId,
  fullName: String,
  email: String,                      // unique, lowercase
  password: String,                   // bcrypt, select:false
  role: enum ["guest", "author", "staff", "admin"],
  isEmailVerified: Boolean,
  isActive: Boolean,
  avatarUrl: String,

  wallet: {
    balance: Number,
    frozenBalance: Number,
    totalEarned: Number,
    totalSpent: Number,
    lifetimeDeposit: Number
  },

  subscription: {
    planCode: String,
    planName: String,
    basePostLimit: Number,
    extraPosts: Number,
    monthlyPriceCoins: Number,
    billingCycle: enum ["monthly", "quarterly", "yearly"],
    autoRenew: Boolean,
    cancelAtPeriodEnd: Boolean,
    status: String,
    startedAt: Date,
    expiresAt: Date,
    currentPeriodStart: Date,
    currentPeriodEnd: Date,
    postsUsedInPeriod: Number,
    renewedAt: Date,
    nextRenewalAt: Date,
    renewalFailedAt: Date,
    gracePeriodEndsAt: Date,
    reminder7dSentAt: Date,
    reminder3dSentAt: Date
  },

  followersCount: Number,
  followingCount: Number,

  gamification: {
    xp: Number,
    level: Number,
    xpToNextLevel: Number,
    postsPublished: Number,
    salesCount: Number
  },

  twoFactor: {
    enabled: Boolean,
    secretEncrypted: String,      // encrypted TOTP secret (AES-256-GCM), select:false
    backupCodeHashes: [String],   // hashed one-time backup codes, select:false
    enabledAt: Date,
    lastVerifiedAt: Date
  },

  refreshToken: String,               // hashed refresh token, select:false
  emailVerificationCodeHash: String,  // select:false
  emailVerificationCodeExpiresAt: Date,
  passwordResetCodeHash: String,      // select:false
  passwordResetCodeExpiresAt: Date,

  createdAt: Date,
  updatedAt: Date
}

// Indexes:
// { email: 1 } unique
// { role: 1 }
// { followersCount: -1 }
// { gamification.xp: -1, gamification.level: -1 }
```

### 4.2 subscriptions

```js
{
  _id: ObjectId,
  userId: ObjectId,
  tier: String,
  price: Number,
  billingCycle: enum ["monthly", "quarterly", "yearly"],
  startDate: Date,
  endDate: Date,
  status: enum ["active", "expired", "cancelled", "refunded"],
  perks: {
    extraCoinReward: Number,
    discountPercent: Number,
    prioritySupport: Boolean,
    customBadge: Boolean,
    featuredProfile: Boolean,
    maxFileUploadMb: Number
  },
  transactionId: ObjectId,
  cancelledAt: Date,
  cancelReason: String,
  createdAt: Date
}

// Indexes:
// { userId: 1, status: 1 }
// { endDate: 1, status: 1 }
```

### 4.3 posts

```js
{
  _id: ObjectId,
  authorId: ObjectId,
  title: String,
  slug: String,                        // unique
  excerpt: String,
  content: String,
  contentFormat: enum ["markdown", "richtext"],
  coverImage: String,
  readingTime: Number,
  categoryId: ObjectId,
  tags: [ObjectId],
  status: enum ["draft", "pending", "published", "rejected", "archived"],
  submittedAt: Date,
  reviewedBy: ObjectId,
  reviewedAt: Date,
  rejectionReason: String,
  revisionHistory: [{ content, editedAt, editReason }],
  coinReward: Number,
  rewardClaimed: Boolean,
  bonusMultiplier: Number,
  views: Number,
  likes: [ObjectId],
  likesCount: Number,
  commentsCount: Number,
  bookmarks: [ObjectId],
  bookmarksCount: Number,
  shares: Number,
  poll: {
    question: String,
    options: [{ _id, text, votesCount }],
    allowMultiple: Boolean,
    endsAt: Date,
    totalVotes: Number
  },
  metaTitle: String,
  metaDescription: String,
  canonicalUrl: String,
  allowComments: Boolean,
  isPinned: Boolean,
  isFeatured: Boolean,
  isExclusive: Boolean,
  publishedAt: Date,
  createdAt: Date,
  updatedAt: Date
}

// Indexes:
// { slug: 1 } unique
// { authorId: 1, status: 1 }
// { status: 1, publishedAt: -1 }
// { status: "pending", submittedAt: 1 }
// { categoryId: 1, status: 1 }
// { tags: 1 }
// { likesCount: -1, views: -1 }
// { title: "text", content: "text" }
```

### 4.4 poll_votes

```js
{
  _id: ObjectId,
  postId: ObjectId,
  optionId: ObjectId,
  userId: ObjectId,
  createdAt: Date
}

// Indexes:
// { postId: 1, userId: 1 } unique compound
// { postId: 1, optionId: 1 }
```

### 4.5 post_comments

```js
{
  _id: ObjectId,
  postId: ObjectId,
  authorId: ObjectId,
  content: String,
  parentId: ObjectId,
  depth: Number (max: 3),
  replyTo: { userId, username },
  likes: [ObjectId],
  likesCount: Number,
  isEdited: Boolean,
  isDeleted: Boolean,
  isHidden: Boolean,
  hiddenBy: ObjectId,
  hideReason: String,
  authorSnapshot: { displayName, avatar, level },
  createdAt: Date,
  updatedAt: Date
}

// Indexes:
// { postId: 1, createdAt: 1 }
// { parentId: 1 }
// { authorId: 1 }
```

### 4.6 categories

```js
{
  _id: ObjectId,
  name: String,
  slug: String,                        // unique
  description: String,
  icon: String,
  color: String,
  coverImage: String,
  scope: enum ["blog", "store", "wiki", "all"],
  parentId: ObjectId,
  ancestors: [ObjectId],
  order: Number,
  postCount: Number,
  productCount: Number,
  isActive: Boolean,
  createdAt: Date
}

// Indexes:
// { slug: 1 } unique
// { scope: 1, order: 1, isActive: 1 }
// { parentId: 1 }
```

### 4.7 tags

```js
{
  _id: ObjectId,
  name: String,                        // unique, lowercase
  slug: String,                        // unique
  description: String,
  usageCount: Number,
  createdBy: ObjectId,
  isApproved: Boolean,
  createdAt: Date
}

// Indexes:
// { slug: 1 } unique
// { name: 1 } unique
// { usageCount: -1 }
```

### 4.8 wiki_articles

```js
{
  _id: ObjectId,
  title: String,
  slug: String,                        // unique
  content: String,
  excerpt: String,
  categoryId: ObjectId,
  tags: [String],
  parentArticleId: ObjectId,
  order: Number,
  breadcrumb: [{ articleId, title, slug }],
  version: Number,
  lastEditedBy: ObjectId,
  changelog: [{ version, editedBy, editedAt, summary, diff }],
  views: Number,
  helpfulYes: Number,
  helpfulNo: Number,
  status: enum ["draft", "published", "archived"],
  isPublic: Boolean,
  requiredTier: enum [null, "pro", "vip"],
  publishedAt: Date,
  createdAt: Date,
  updatedAt: Date
}

// Indexes:
// { slug: 1 } unique
// { categoryId: 1, order: 1 }
// { parentArticleId: 1, order: 1 }
// { title: "text", content: "text" }
```

### 4.9 wiki_categories

```js
{
  _id: ObjectId,
  name: String,
  slug: String,
  description: String,
  icon: String,
  order: Number,
  parentId: ObjectId,
  articleCount: Number,
  isActive: Boolean,
  createdAt: Date
}

// Indexes:
// { slug: 1 }
// { order: 1, isActive: 1 }
```

### 4.10 products

```js
{
  _id: ObjectId,
  name: String,
  slug: String,                      // unique
  description: String,
  type: enum ["digital", "custom_order"],
  status: enum ["draft", "pending_review", "active", "rejected", "archived"],
  priceAmount: Number,
  currency: String,                  // default "VND"
  stock: Number,
  createdBy: ObjectId,
  digitalAsset: {
    bucketName: String,
    objectName: String,
    fileName: String,
    mimeType: String,
    size: Number,
    etag: String,
    uploadedAt: Date
  },
  submittedAt: Date,
  reviewedBy: ObjectId,
  reviewedAt: Date,
  rejectionReason: String,
  createdAt: Date,
  updatedAt: Date
}

// Indexes:
// { slug: 1 } unique
// { status: 1, type: 1, createdAt: -1 }
// { createdBy: 1, createdAt: -1 }
// { status: 1, submittedAt: 1 }
// { name: "text", description: "text" }
```

### 4.11 orders

```js
{
  _id: ObjectId,
  orderNumber: String,                // unique
  buyerId: ObjectId,
  sellerId: ObjectId,
  items: [{
    productId: ObjectId,
    productName: String,
    productSlug: String,
    productType: enum ["digital","custom_order"],
    currency: String,
    quantity: Number,
    unitPrice: Number,
    lineTotal: Number,
    digitalAsset: { bucketName, objectName, fileName, mimeType, size },
    customData: Mixed
  }],
  subtotal: Number,
  discountTotal: Number,
  total: Number,
  currency: String,
  platformFee: Number,
  sellerReceives: Number,
  source: enum ["buy_now","cart"],
  buyerTransactionId: ObjectId,
  transactionId: ObjectId,
  sellerTransactionId: ObjectId,
  platformFeeTransactionId: ObjectId,
  status: enum [
    "pending", "paid",
    "quoted", "quote_accepted",
    "processing", "delivered", "completed",
    "cancelled"
  ],
  quote: { priceAmount, estimatedDays, note, quotedAt, quotedBy, acceptedAt },
  deliveryFiles: [{
    bucketName, objectName, fileName, mimeType, size, etag,
    uploadedAt, uploadedBy, fromProductAsset
  }],
  deliveryEmailLogs: [{ fileObjectName, status, claimedAt, sentAt }],
  deliveredAt: Date,
  completedAt: Date,
  paidAt: Date,
  autoCompleteAt: Date,
  settledAt: Date,
  statusHistory: [{ from, to, note, changedBy, changedAt }],
  idempotencyKey: String,
  cancelReason: String,
  createdAt: Date,
  updatedAt: Date
}

// Indexes:
// { orderNumber: 1 } unique
// { buyerId: 1, status: 1, createdAt: -1 }
// { sellerId: 1, status: 1, createdAt: -1 }
// { status: 1, autoCompleteAt: 1 }
// { buyerId: 1, createdAt: -1 }
// { buyerId: 1, idempotencyKey: 1 } unique sparse
```

### 4.12 reviews

```js
{
  _id: ObjectId,
  targetType: enum ["product", "store"],
  targetId: ObjectId,
  orderId: ObjectId,
  reviewerId: ObjectId,
  rating: Number (1-5),
  title: String,
  content: String,
  images: [String],
  aspects: { quality, delivery, communication },
  managerReply: { content, repliedAt },
  isVerifiedPurchase: Boolean,
  helpfulCount: Number,
  reportCount: Number,
  isHidden: Boolean,
  createdAt: Date,
  updatedAt: Date
}

// Indexes:
// { targetType: 1, targetId: 1, createdAt: -1 }
// { orderId: 1, targetType: 1 } unique compound
// { reviewerId: 1 }
```

### 4.13 tickets

```js
{
  _id: ObjectId,
  ticketNumber: String,                // "TK-0001"
  createdBy: ObjectId,
  assignedTo: ObjectId,
  relatedTo: { type: enum ["order","product","wallet","account",null], id: ObjectId },
  subject: String,
  category: enum ["order_issue","payment","product_quality","refund",
                   "custom_order","account","store_report","bug_report",
                   "feature_request","general"],
  priority: enum ["low","medium","high","urgent"],
  status: enum ["open","awaiting_user","in_progress","escalated",
                 "resolved","closed","reopened"],
  sla: { firstResponseDue, resolutionDue },
  firstResponseAt: Date,
  resolvedAt: Date,
  closedAt: Date,
  satisfaction: { rating, comment, ratedAt },
  tags: [String],
  isEscalated: Boolean,
  escalatedTo: ObjectId,
  messagesCount: Number,
  lastMessageAt: Date,
  lastMessageBy: enum ["user","staff"],
  createdAt: Date,
  updatedAt: Date
}

// Indexes:
// { ticketNumber: 1 } unique
// { createdBy: 1, status: 1, createdAt: -1 }
// { assignedTo: 1, status: 1, priority: -1 }
// { status: 1, priority: -1, createdAt: 1 }
// { "relatedTo.type": 1, "relatedTo.id": 1 }
```

### 4.14 ticket_messages

```js
{
  _id: ObjectId,
  ticketId: ObjectId,
  senderId: ObjectId,
  content: String,
  attachments: [{ filename, url, size, mimeType }],
  isInternal: Boolean,
  isSystem: Boolean,
  systemEvent: String,
  createdAt: Date
}

// Indexes:
// { ticketId: 1, createdAt: 1 }
// { ticketId: 1, isInternal: 1 }
```

### 4.15 transactions

```js
{
  _id: ObjectId,
  userId: ObjectId,
  type: enum [
    "deposit", "purchase", "subscription",
    "sale_income", "post_reward", "referral_bonus",
    "refund_buyer", "refund_store",
    "platform_fee", "admin_adjust", "withdrawal"
  ],
  amount: Number,
  balanceBefore: Number,
  balanceAfter: Number,
  reference: { model: String, id: ObjectId },
  counterpartyId: ObjectId,
  externalPayment: {
    provider, externalId, amountReal, currency, exchangeRate
  },
  status: enum ["pending","completed","failed","reversed"],
  description: String,
  note: String,
  processedBy: ObjectId,
  ip: String,
  userAgent: String,
  flagged: Boolean,
  flagReason: String,
  completedAt: Date,
  createdAt: Date
}

// Indexes:
// { userId: 1, createdAt: -1 }
// { userId: 1, type: 1, createdAt: -1 }
// { status: 1 }
// { "reference.model": 1, "reference.id": 1 }
// { "externalPayment.provider": 1, "externalPayment.externalId": 1 }
// { flagged: 1, createdAt: -1 }
```

### 4.16 deposit_requests

```js
{
  _id: ObjectId,
  userId: ObjectId,
  provider: String,
  amountReal: Number,
  currency: String,
  coinAmount: Number,
  exchangeRate: Number,
  paymentUrl: String,
  providerOrderId: String,
  providerTransactionId: String,
  providerResponse: Mixed,
  status: enum ["pending","processing","completed","failed","expired"],
  transactionId: ObjectId,
  expiresAt: Date,
  completedAt: Date,
  ip: String,
  createdAt: Date
}

// Indexes:
// { userId: 1, status: 1, createdAt: -1 }
// { providerOrderId: 1 }
// { status: 1, expiresAt: 1 }
```

### 4.17 notifications

```js
{
  _id: ObjectId,
  userId: ObjectId,
  category: enum ["subscription","ticket","blog","store","wallet","gamification","social"],
  type: enum [
    "subscription_reminder","subscription_renewed","subscription_failed","subscription_expired",
    "ticket_created","ticket_reply","ticket_assigned","ticket_status_changed",
    "blog_post_approved","blog_post_rejected",
    "store_order_created","store_quote_created","store_quote_accepted","store_quote_rejected",
    "store_delivery_uploaded","store_order_completed","store_order_auto_completed",
    "wallet_deposit_completed","wallet_deposit_failed","wallet_deposit_cancelled","wallet_admin_adjusted",
    "badge_earned"
  ],
  title: String,
  message: String,
  readAt: Date,
  metadata: Mixed,
  createdAt: Date
}

// Indexes:
// { userId: 1, createdAt: -1 }
// { userId: 1, readAt: 1, createdAt: -1 }
// TTL policy target: 90 days (runtime cleanup/index rollout pending)
```

### 4.18 badges

```js
{
  _id: ObjectId,
  code: String, // unique
  name: String,
  description: String,
  iconUrl: String,
  criteria: {
    type: enum ["posts_published","sales_count","level_reached"],
    threshold: Number
  },
  xpReward: Number,
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date
}

// Indexes:
// { code: 1 } unique
// { isActive: 1, createdAt: -1 }
```

### 4.19 user_badges

```js
{
  _id: ObjectId,
  userId: ObjectId,
  badgeId: ObjectId,
  badgeCode: String,
  awardedAt: Date,
  metadata: Mixed
}

// Indexes:
// { userId: 1, badgeCode: 1 } unique compound
// { userId: 1, awardedAt: -1 }
```

### 4.20 leaderboard_snapshots

```js
{
  _id: ObjectId,
  period: enum ["weekly","monthly","alltime"],
  periodKey: String, // unique with period
  entries: [{
    userId,
    rank,
    xp,
    level,
    postsPublished,
    salesCount
  }],
  generatedAt: Date,
  createdAt: Date,
  updatedAt: Date
}

// Indexes:
// { period: 1, periodKey: 1 } unique
```

### 4.21 audit_logs

```js
{
  _id: ObjectId,
  userId: ObjectId,
  userRole: String,
  ip: String,
  userAgent: String,
  method: String,     // POST/PATCH/PUT/DELETE
  route: String,      // normalized route path
  action: String,     // "METHOD /route"
  target: String,     // selected route param id
  statusCode: Number,
  severity: enum ["info","warning","error"],
  errorMessage: String,
  details: Mixed,     // sanitized body/query/params snapshot
  createdAt: Date
}

// Indexes:
// { userId: 1, createdAt: -1 }
// { action: 1, createdAt: -1 }
// { severity: 1, createdAt: -1 }
// TTL: { createdAt: 1, expireAfterSeconds: 15552000 } (180 days)
```

### 4.22 carts

```js
{
  _id: ObjectId,
  userId: ObjectId,                 // unique: one active cart per user
  items: [
    {
      _id: ObjectId,
      productId: ObjectId,
      productName: String,
      productSlug: String,
      unitPrice: Number,
      quantity: Number,
      lineTotal: Number,
      currency: String
    }
  ],
  subtotal: Number,
  discountTotal: Number,
  total: Number,
  currency: String,
  createdAt: Date,
  updatedAt: Date
}

// Indexes:
// { userId: 1 } unique
```

### 4.23 user_follows

```js
{
  _id: ObjectId,
  followerId: ObjectId,
  followingId: ObjectId,
  createdAt: Date,
  updatedAt: Date
}

// Indexes:
// { followerId: 1, followingId: 1 } unique
// { followingId: 1, createdAt: -1 }
// { followerId: 1, createdAt: -1 }
```

---

## 5. API Endpoints

> **Implementation snapshot (2026-03-25):** Auth (with 2FA step-up), Users, Blog, Wallet/Payment, Subscriptions, Notifications (HTTP + WS), Store/Orders/Reviews, Cart, Tickets (`/tickets`, `/admin/tickets`), Admin dashboard/audit, Social and Gamification MVP are implemented.
> Endpoints not in code are marked as **(planned)**.

### 5.1 Auth

| Method | Path                  | Auth   | Description     |
| ------ | --------------------- | ------ | --------------- |
| POST | /auth/register | Public | Register |
| POST | /auth/login | Public | Sign in (returns challenge when user enabled 2FA) |
| POST   | /auth/refresh         | Public | Refresh token   |
| POST | /auth/logout | User | Sign out |
| GET | /auth/me | User | Current user |
| POST | /auth/forgot-password | Public | Send reset email |
| POST   | /auth/reset-password  | Public | Reset password  |
| POST | /auth/verify-email | Public | Email authentication |
| POST | /auth/2fa/enable | User | Create TOTP setup challenge (implemented) |
| POST | /auth/2fa/verify | Public | Verify setup/login 2FA token (implemented) |
| POST | /auth/2fa/disable | User | Disable 2FA with password + factor (implemented) |

### 5.2 Users

| Method | Path                 | Auth   | Description         |
| ------ | -------------------- | ------ | ------------------- |
| GET | /users/me | User | Personal profile (implemented) |
| PATCH | /users/me | User | Update profile (implemented) |
| PATCH | /users/me/avatar | User | Upload avatar (implemented) |
| GET | /users/profile | User | Profile alias (implemented) |
| PATCH | /users/profile | User | Update profile alias (implemented) |
| GET | /users/:username | Public | Public profile (implemented) |
| GET | /users | Admin | User listing (implemented) |
| GET | /users/:id | Admin | User detail (implemented) |
| PATCH | /users/:id | Admin | Admin update user fields (implemented) |
| PATCH | /users/:id/role | Admin | Change role (implemented) |
| PATCH | /users/:id/status | Admin | Enable/disable user (implemented) |
| GET | /users/:id/followers | User | List of followers (implemented) |
| GET | /users/:id/following | User | Following list (implemented) |
| POST   | /users/:id/follow    | User   | Follow (implemented) |
| DELETE | /users/:id/follow    | User   | Unfollow (implemented) |
| GET | /users/leaderboard | User | Ranking (implemented) |

### 5.3 Blog — Posts

| Method | Path                | Auth         | Description         |
| ------ | ------------------- | ------------ | ------------------- |
| GET    | /posts              | Public       | Listing (published) |
| GET | /posts/:slug | Public | Article details |
| GET | /posts/me/:id | Author+ | My post detail (implemented) |
| POST | /posts | Author+ | Create draft |
| POST | /posts/:id/cover-image | Author+ | Upload cover image (implemented) |
| POST | /posts/block-image | Author+ | Upload editor block image (implemented) |
| PATCH | /posts/:id | Author (own) | Update post |
| DELETE | /posts/:id | Author (own) | Delete post |
| POST | /posts/:id/submit | Author (own) | Submit for approval |
| POST   | /posts/:id/like     | User         | Toggle like         |
| GET | /posts/:id/like-status | User | My like status (implemented) |
| POST   | /posts/:id/bookmark | User         | Toggle bookmark     |
| GET | /posts/me | Author+ | My article |

### 5.4 Blog — Comments

| Method | Path                    | Auth       | Description        |
| ------ | ----------------------- | ---------- | ------------------ |
| GET | /posts/:postId/comments | Public | List of comments |
| POST | /posts/:postId/comments | User | Create a comment |
| PATCH | /comments/:id | User (own) | Edit comment |
| DELETE | /comments/:id | User (own) | Delete comments |
| POST | /comments/:id/like | User | Toggle like comment (implemented) |
| PATCH | /comments/:id/hide | Staff/Admin | Hide/unhide comment (implemented) |

### 5.5 Blog — Polls

| Method | Path                        | Auth   | Description  |
| ------ | --------------------------- | ------ | ------------ |
| POST   | /posts/:postId/poll/vote    | User   | Vote poll    |
| GET | /posts/:postId/poll/results | Public | Poll results |

### 5.6 Blog — Moderation

| Method | Path                          | Auth        | Description     |
| ------ | ----------------------------- | ----------- | --------------- |
| GET | /moderation/posts | Staff/Admin | Post review queue (implemented) |
| PATCH | /moderation/posts/:id/approve | Staff/Admin | Browse articles (implemented) |
| PATCH | /moderation/posts/:id/reject | Staff/Admin | Reject article (implemented) |
| GET | /moderation/stats | Staff/Admin | Browsing statistics (implemented) |

### 5.7 Categories

| Method | Path            | Auth   | Description |
| ------ | --------------- | ------ | ----------- |
| GET | /categories | Public | List |
| GET | /categories/admin/all | Staff/Admin | Admin listing (implemented) |
| POST | /categories | Staff/Admin | Create |
| PATCH | /categories/:id | Staff/Admin | Update |
| DELETE | /categories/:id | Staff/Admin | Delete |

### 5.8 Tags

| Method | Path              | Auth   | Description         |
| ------ | ----------------- | ------ | ------------------- |
| GET | /tags | Public | List (popular) |
| GET | /tags/:slug/posts | Public | Articles by tag |
| GET | /tags/admin/all | Staff/Admin | Admin listing (implemented) |
| POST | /tags | Staff/Admin | Create tag (implemented) |
| PATCH | /tags/:id | Staff/Admin | Update tag (implemented) |
| DELETE | /tags/:id | Staff/Admin | Delete tag (implemented) |

### 5.9 Wiki (implemented)

| Method | Path              | Auth        | Description                |
| ------ | ----------------- | ----------- | -------------------------- |
| GET | /wiki | Public | List of articles (implemented) |
| GET | /wiki/:slug | Public | Article details (implemented) |
| POST | /wiki | Staff/Admin | Create article (implemented) |
| PATCH | /wiki/:id | Staff/Admin | Update/create new version (implemented) |
| DELETE | /wiki/:id | Admin | Delete/archive (implemented) |
| POST   | /wiki/:id/helpful | User        | Vote helpful (implemented) |
| GET    | /wiki/categories  | Public      | Wiki categories (implemented) |

### 5.10 Store — Products

| Method | Path            | Auth        | Description    |
| ------ | --------------- | ----------- | -------------- |
| GET    | /products       | Public      | Listing (implemented) |
| GET | /products/:identifier | Public | Details by id/slug (implemented) |
| POST | /products | Staff/Admin | Create product (implemented) |
| PATCH | /products/:id | Staff/Admin | Update (implemented) |
| DELETE | /products/:id   | Staff/Admin | Archive (implemented) |
| GET | /products/me | Staff/Admin | Store products (implemented) |
| POST | /products/:id/file | Staff/Admin | Upload digital product asset (implemented) |
| POST | /products/:id/submit-review | Staff/Admin | Submit product for moderation (implemented) |

### 5.11 Store — Orders

| Method | Path                       | Auth                     | Description              |
| ------ | -------------------------- | ------------------------ | ------------------------ |
| POST | /orders | User | Create direct order (implemented) |
| GET | /orders/me | User | My order (buyer) (implemented) |
| GET | /orders/:id | User (buyer)/Staff/Admin | Single details (implemented) |
| POST | /orders/:id/complete | User (buyer) | Confirmation complete (implemented, FE surfaced) |
| POST | /orders/:id/cancel | User (buyer) | Cancel order request (implemented, ticket-based, FE surfaced) |
| POST | /orders/:id/refund-request | User (buyer) | Refund request (implemented, ticket-based, FE surfaced) |
| POST | /orders/:id/quote/accept | User (buyer) | Accept custom-order quote (implemented) |
| POST | /orders/:id/quote/reject | User (buyer) | Reject custom-order quote (implemented) |
| GET    | /orders/:id/download       | User (buyer)             | Download file (implemented)  |
| GET | /orders/download/email/:token | Public | Download redirect via signed email token (implemented) |

### 5.12 Store — Management Orders

| Method | Path                      | Auth        | Description           |
| ------ | ------------------------- | ----------- | --------------------- |
| GET | /store/orders | Staff/Admin | Store orders (implemented) |
| PATCH | /store/orders/:id/status | Staff/Admin | Status Update (implemented, strict transition) |
| GET | /store/products/pending-review | Staff/Admin | Product moderation queue (implemented) |
| POST | /store/products/:id/approve | Staff/Admin | Approve pending product (implemented) |
| POST | /store/products/:id/reject | Staff/Admin | Reject pending product (implemented) |
| POST | /store/orders/:id/quote | Staff/Admin | Custom order quote (implemented) |
| POST | /store/orders/:id/deliver | Staff/Admin | Upload delivery file (implemented) |
| GET    | /store/dashboard          | Staff/Admin | Revenue dashboard (implemented, MVP) |

### 5.13 Store — Reviews

| Method | Path                         | Auth         | Description      |
| ------ | ---------------------------- | ------------ | ---------------- |
| GET | /products/:productId/reviews | Public | Product reviews (implemented) |
| POST | /products/:productId/reviews | User (buyer) | Create review (implemented) |
| GET    | /store/reviews               | Public       | Store reviews (implemented) |
| POST   | /store/reviews               | User (buyer) | Review store (implemented) |
| PATCH  | /reviews/:id/reply           | Staff/Admin  | Reply review (implemented) |

### 5.14 Wallet

| Method | Path                            | Auth | Description                 |
| ------ | ------------------------------- | ---- | --------------------------- |
| GET    | /wallet/balance                 | User | Balance (alias)            |
| GET    | /wallet/me                      | User | Balance (canonical)        |
| GET    | /wallet/transactions            | User | Transaction history (alias)|
| GET    | /wallet/me/transactions         | User | Transaction history        |
| POST   | /wallet/deposit                 | User | Create deposit request     |
| POST   | /wallet/deposit-requests        | User | Create deposit request     |
| GET    | /wallet/deposit/:id             | User | Deposit status             |
| GET    | /wallet/deposit-requests/:id    | User | Deposit status             |
| POST   | /wallet/deposit/:id/cancel      | User | Cancel pending deposit     |
| POST   | /wallet/deposit-requests/:id/cancel | User | Cancel pending deposit |

### 5.15 Payment Callbacks

| Method | Path                        | Auth            | Description                |
| ------ | --------------------------- | --------------- | -------------------------- |
| POST   | /payment/payos/webhook      | Public (verify) | PayOS webhook callback     |
| POST   | /payment/callback/payos     | Public (verify) | PayOS callback alias       |
| POST   | /payment/payos/return-sync  | Public (verify) | Sync PayOS return status   |
| GET    | /payment/payos/return-status| Public          | Read normalized return status |

### 5.16 Tickets

| Method | Path                  | Auth             | Description     |
| ------ | --------------------- | ---------------- | --------------- |
| POST | /tickets | User | Create ticket (implemented) |
| GET | /tickets/me | User | My Tickets (implemented) |
| GET | /tickets/:id | User (own)/Staff/Admin | Details (implemented) |
| POST | /tickets/:id/messages | User/Staff/Admin | Send message (implemented) |
| PATCH | /tickets/:id/close | User (own) | Close ticket (implemented) |
| POST | /tickets/:id/reopen | User (own) | Reopen (implemented) |
| POST | /tickets/:id/rate | User (own) | Satisfaction rating (implemented) |

### 5.17 Tickets — Staff

| Method | Path                             | Auth        | Description    |
| ------ | -------------------------------- | ----------- | -------------- |
| GET | /admin/tickets | Staff/Admin | Admin: all tickets, Staff: assigned-to-self + unassigned (implemented) |
| GET | /admin/tickets/assignees | Staff/Admin | List active assignable staff/admin (implemented) |
| PATCH | /admin/tickets/:id/assign | Staff/Admin | Admin reassign any, Staff claim unassigned to self only (implemented) |
| PATCH | /admin/tickets/:id/status | Staff/Admin | Admin full status control, Staff operational statuses on self-assigned only (implemented) |
| POST | /admin/tickets/:id/internal-note | Staff/Admin | Internal notes; staff only when assigned to self (implemented) |

### 5.17.1 Tickets WebSocket

- Namespace: `/tickets` (configurable by `WS_TICKETS_NAMESPACE`)
- Auth handshake: `auth.token = "<accessToken>"` or `"Bearer <accessToken>"`
- Client events:
  - `tickets:subscribe`
  - `tickets:unsubscribe`
- Server events:
  - `tickets:ready`
  - `tickets:subscribed`
  - `tickets:message`
  - `tickets:ticket-updated`
  - `tickets:error`
- Room visibility:
  - Author joins `ticket:{id}:public`
  - Staff/Admin joins `ticket:{id}:internal`
  - Internal notes are pushed to internal room only

### 5.18 Notifications

| Method | Path                           | Auth | Description         |
| ------ | ------------------------------ | ---- | ------------------- |
| GET    | /notifications/me              | User | List notifications  |
| GET    | /notifications/me/unread-count | User | Unread count        |
| POST   | /notifications/me/:id/read     | User | Mark one as read    |
| POST   | /notifications/me/read-all     | User | Mark all as read    |

### 5.18.1 Notifications WebSocket

- Namespace: `/notifications`
- Auth handshake: `auth.token = "<accessToken>"` or `"Bearer <accessToken>"`
- Server push events:
  - `notifications:ready`
  - `notifications:new`
  - `notifications:unread-count`
  - `notifications:read`
  - `notifications:read-all`
  - `notifications:error`

### 5.19 Gamification

| Method | Path            | Auth   | Description    |
| ------ | --------------- | ------ | -------------- |
| GET | /badges | Public | All badges |
| GET | /badges/me | User | Badges reached |
| GET    | /users/leaderboard | User | Gamification leaderboard |

### 5.20 Subscription

| Method | Path                                 | Auth   | Description                      |
| ------ | ------------------------------------ | ------ | -------------------------------- |
| GET    | /subscriptions/plans                 | Public | Plans and cycle pricing          |
| GET    | /subscriptions/me                    | User   | Current subscription             |
| POST   | /subscriptions/me/purchase           | User   | Purchase or upgrade by wallet    |
| POST   | /subscriptions/me/renew              | User   | Legacy renew alias (compat)      |
| POST   | /subscriptions/me/auto-renew         | User   | Enable/disable auto-renew        |
| POST   | /subscriptions/me/cancel-at-period-end | User | Cancel at period end            |
| GET    | /subscriptions/me/history            | User   | History derived from transactions |

### 5.21 Upload

| Method | Path               | Auth        | Description              |
| ------ | ------------------ | ----------- | ------------------------ |
| POST | /upload/image | User | Upload photos (implemented) |
| POST | /upload/file | Staff/Admin | Upload product files (implemented) |
| POST   | /upload/attachment | User        | Upload attachment ticket (implemented) |

### 5.22 Admin

| Method | Path                          | Auth  | Description      |
| ------ | ----------------------------- | ----- | ---------------- |
| GET    | /admin/dashboard/stats        | Admin | Overview numbers (implemented) |
| GET    | /admin/dashboard/revenue      | Admin | Revenue chart (implemented) |
| GET    | /admin/dashboard/users-growth | Admin | User growth (implemented) |
| GET    | /admin/users                  | Admin | List all users (implemented alias) |
| PATCH | /admin/users/:id/role | Admin | Change role (implemented alias) |
| POST   | /admin/users/:id/ban          | Admin | Ban user (implemented) |
| POST   | /admin/users/:id/unban        | Admin | Unban (implemented) |
| POST | /admin/wallet/adjust | Admin | Add/subtract coins (implemented) |
| GET    | /admin/wallet/stats           | Admin | Wallet stats (implemented) |
| GET    | /admin/audit-logs             | Admin | Audit logs (implemented) |

### 5.23 Cart

| Method | Path               | Auth | Description |
| ------ | ------------------ | ---- | ----------- |
| GET    | /cart              | User | Get current cart (implemented) |
| POST   | /cart/items        | User | Add item to cart (implemented) |
| PATCH  | /cart/items/:itemId | User | Update item quantity (implemented) |
| DELETE | /cart/items/:itemId | User | Remove item from cart (implemented) |
| DELETE | /cart              | User | Clear cart (implemented) |
| POST   | /cart/checkout     | User | Checkout cart to order (implemented) |

**Total tracked endpoints: 110+ (includes planned)**

---

## 6. Project Structure

```
server/
├── .env
├── .env.example
├── docker-compose.yml
├── nest-cli.json
├── package.json
├── tsconfig.json
│
├── test/                            # E2E tests
│
└── src/
    ├── main.ts                      # Bootstrap + Swagger + CORS
    ├── app.module.ts                # Root module
    │
    ├── config/
    │   ├── app.config.ts
    │   ├── database.config.ts
    │   ├── jwt.config.ts
    │   ├── mail.config.ts
    │   ├── minio.config.ts
    │   ├── store.config.ts
    │   ├── two-factor.config.ts
    │   └── wallet.config.ts
    │
    ├── database/
    │   ├── database.module.ts
    │   └── seeders/
    │       ├── seeder.module.ts
    │       ├── seeder.service.ts
    │       ├── admin.seeder.ts
    │       ├── migrate-wallet-transaction-units.ts
    │       └── migrate-subscription-tier-v2.ts
    │
    ├── common/
    │   ├── constants/
    │   ├── decorators/
    │   ├── guards/
    │   ├── filters/
    │   ├── interceptors/
    │   ├── pipes/
    │   ├── dto/
    │   └── utils/
    │
    ├── alerts/
    │   ├── alerts.module.ts
    │   └── ops-alert.service.ts
    │
    ├── auth/
    │   └── ...
    │
    ├── users/
    │   └── ...
    │
    ├── blog/
    │   └── ...
    │
    ├── store/
    │   ├── products/
    │   ├── orders/
    │   └── reviews/
    │
    ├── cart/
    │   ├── cart.module.ts
    │   ├── cart.controller.ts
    │   ├── cart.service.ts
    │   └── schemas/
    │
    ├── wallet/
    │   ├── wallet.module.ts
    │   ├── wallet.controller.ts
    │   ├── wallet.admin.controller.ts
    │   ├── wallet.service.ts
    │   ├── payment.controller.ts
    │   ├── payos.provider.ts
    │   ├── schemas/
    │   ├── dto/
    │   └── tests/
    │
    ├── notifications/
    │   ├── notifications.module.ts
    │   ├── notifications.controller.ts
    │   ├── notifications.service.ts
    │   ├── notifications.gateway.ts
    │   └── schemas/
    │
    ├── tickets/
    │   └── ...
    │
    ├── admin/
    │   └── ...
    │
    ├── social/
    │   └── ...
    │
    ├── gamification/
    │   └── ...
    │
    ├── subscriptions/
    │   ├── subscriptions.module.ts
    │   ├── subscriptions.controller.ts
    │   ├── subscriptions.service.ts
    │   ├── subscription.constants.ts
    │   ├── subscription.util.ts
    │   ├── dto/
    │   └── schemas/
    │
    ├── mail/
    │   ├── mail.module.ts
    │   ├── mail.service.ts
    │   └── templates/
    │
    └── minio/
        └── ...
```

> Note: Backend now has `tickets`, `admin`, `social`, `gamification`, realtime `notifications`, and `wiki` modules. Redis/Bull queue and multi-instance realtime infra remain roadmap.

---

## 7. Phase Plan

### Phase 1 — Foundation (7-8 days)

**Goal:** Server running, registration/login, JWT auth

**Tasks:**

- [x] Setup NestJS project + TypeScript
- [ ] Docker Compose (MongoDB + Redis)
- [x] Config module (env vars)
- [x] Database module (Mongoose connection)
- [x] Common: guards, filters, interceptors, pipes, dto, utils
- [x] Auth module: register, login, refresh, logout
- [x] JWT strategy + refresh token rotation
- [x] Users module: schema, CRUD profile
- [x] Role system (decorators + guards)
- [x] Swagger setup
- [x] Admin seeder (create first admin account)

**Result:** Registered, logged in, JWT works. Swagger docs run.

---

### Phase 2 — Blog System (6-7 days)

**Goal:** Blog activity, review posts, comments, polls

**Tasks:**

- [x] Upload module (image → MinIO/S3)
- [x] Categories module (CRUD, parentId-based nesting)
- [x] Tags module (CRUD, usage count)
- [x] Posts module: create draft, update, delete, submit, listing, search
- [x] Moderation module: pending queue, approve, reject
- [x] Comments module: nested replies, likes, hide (staff)
- [x] Poll system: embedded in post, vote, results
- [x] Full-text search (MongoDB text index + searchText)
- [x] Bookmark system

**Result:** Completed backend + frontend for Blog/Moderation (verified lint/test/build).

---

### Phase 3 — Wallet & Payment (8-10 days)

**Goal:** Wallet coin system, PayOS deposits, and subscription revamp with auto-renew

**Tasks:**

- [x] Add wallet fields to User schema
- [x] Transaction schema
- [x] Wallet service with MongoDB session for charging/reward/refund
- [x] Deposit request flow
- [x] PayOS provider: payment link + webhook + return-sync endpoints
- [x] Anti-fraud and idempotency guards for deposits
- [x] Admin wallet adjust API
- [x] Subscription revamp: `free/pro/vip` + monthly/quarterly/yearly pricing
- [x] Subscription purchase with wallet coins
- [x] Auto-renew scheduler with reminders and 3-day grace period
- [x] Subscription history derivation from wallet transactions
- [x] Minimal subscription notification feed + email alerts
- [x] **⚠️ Unit tests for wallet/subscription critical paths**

**Result:** Wallet and subscription phase is delivered for Phase 3 review.

**Validation snapshot (checked 2026-03-19):**

- [x] Backend build passes.
- [x] Backend unit tests pass.
- [x] Frontend tests + typecheck pass.
- [x] Docs runtime (README backend/frontend) synchronized with current code.

---

### Phase 4 — Store & Orders (7-8 days)

**Goal:** Buy and sell products, store dashboard (Admin owner + Staff manager)

**Tasks:**

- [x] Products module: CRUD (staff/admin), listing, search (MVP)
- [x] Product moderation (pending_review)
- [x] Orders module: create → wallet.purchase(), status flow (paid state MVP)
- [x] Cart module: get/add/update/remove/clear/checkout (MVP)
- [x] Digital product: auto-deliver download link
- [x] Custom order: quote flow (staff/admin quote → buyer accept)
- [x] Delivery files upload
- [x] Store dashboard: orders, revenue stats (staff/admin) (MVP summary)
- [x] Reviews module: product + store reviews, aspects, staff/admin reply (MVP)
- [x] Auto-complete cron (7 days after delivery)
- [x] Platform fee calculation
- [x] Secure file download (presigned URL)

**Result:** Delivered beyond MVP: products + buy-now orders + cart checkout + review APIs + store dashboard + moderation + quote/delivery + auto-complete + platform-fee settlement + secure download are live. Buyer `complete/cancel/refund-request` flows are now implemented (cancel/refund as ticket-based requests).

---

### Phase 5 — Tickets + Notifications + Mail (6-7 days)

**Goal:** Deliver support + realtime notifications foundation

**Tasks:**

- [x] Tickets module: create, messages, assign, status, SLA
- [x] Ticket admin: assign, internal notes, escalate
- [x] Satisfaction rating
- [ ] Mail module: templates (HBS), async send via Bull queue
- [x] Email: verify, reset password, subscription reminders/renewal alerts
- [x] Notifications module: create, list, mark read
- [x] WebSocket gateway: realtime push (`/notifications`)
- [x] Integrate notifications into old modules (blog, store, wallet)

**Result:** Delivered (tickets + realtime notifications + integration hooks). Durable queue (Bull/Redis) remains pending.

---

### Phase 6 — Gamification, Subscription & Polish (8-10 days)

**Goal:** Feature complete, production-ready

**Tasks:**

- [x] Add gamification fields to User schema
- [x] XP service: addXp, checkLevelUp
- [x] Badges: templates, checkAndAward automatically
- [x] Leaderboard: pre-computed snapshots (cron)
- [ ] Referral system: code, track, reward
- [x] Social: follow/unfollow, profile page data (API scope)
- [x] Subscription module: plans, purchase, cancel/auto-renew, history (quota-first)
- [ ] Subscription perks: bonus coin, discount, exclusive content
- [x] Subscription auto-renew/expiry cron with reminders + grace period
- [x] Wiki/Knowledge base module
- [x] 2FA: TOTP enable/verify/disable, backup codes
- [x] Admin dashboard: stats, revenue, user growth, audit logs
- [x] Seeder: badges (categories already available)
- [ ] Rate limiting fine-tune
- [ ] Security review
- [ ] Complete API documentation

**Result:** In progress; core backend delivered for gamification/social/2FA/admin/wiki. Remaining: referral, subscription perks, infra hardening.

---

### Timeline

```
Phase 1 ████████░░░░░░░░░░░░░░░░░░░░░░ Week 1-2 (Foundation)
Phase 2 ████████████████░░░░░░░░░░░░░░ Week 2-3 (Blog) ✅
Phase 3 ░░░░░░░░░░░░░░████████░░░░░░░░ Week 4-5 (Wallet) ✅
Phase 4 ░░░░░░░░░░░░░░░░░░░░░░████████ Week 5-7 (Store) ✅
Phase 5 ░░░░░░░░░░░░░░░░░░░░░░░░░░████ Week 7-8 (Support) ✅
Phase 6 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░██ Week 9-11 (Polish) ▶

Total: ~11 weeks (2.5-3 months)
Actual: ~14-16 weeks (3.5-4 months) with debug + testing
```

---

## 8. Flow Diagrams

### 8.1 Order Flow — Digital Product

```
Buyer chooses product
    │
    ▼
POST /orders (productId, quantity)
    │
    ▼
Server checks:
├── Product active? Stock enough?
├── Does Buyer have enough coins?
└── Product has digital asset?
    │
    ▼
MongoDB Transaction:
├── Minus coin buyer (wallet.balance -= total)
├── Create transaction (type: "purchase")
├── Create order (status: "paid")
├── Reduce stock
└── Auto set status → "delivered" (digital)
    │
    ▼
Order status: "delivered"
├── Save deliveryFiles from product digital asset
├── Dispatch delivery email link (signed token)
└── Set autoCompleteAt = deliveredAt + 7 days
    │
    ▼
Cron auto-complete:
├── Status → "completed"
├── Settlement: sellerReceives = total - platformFee
├── Create transaction (type: "sale_income")
├── Create transaction (type: "platform_fee")
└── Notify buyer + store operators (`store_order_auto_completed`)
```

### 8.2 Order Flow — Custom Order

```
Buyer fills out the request form
    │
    ▼
POST /orders (productId, customData)
    │
    ▼
Order status: "pending" (chưa trừ coin)
├── auto-bootstrap ticket thread linked with order
    │
    ▼
Staff/Admin view requests and quotes:
POST /store/orders/:id/quote (price, estimatedDays, note)
    │
    ▼
Order status: "quoted"
├── Notify buyer (`store_quote_created`)
    │
    ▼
Buyer accepts or rejects:
├── Accept (/orders/:id/quote/accept)
│ ├── wallet.purchase(quote.priceAmount)
│ └── status: "quote_accepted" → "processing"
└── Reject (/orders/:id/quote/reject)
  └── status: "cancelled" (no refund because no upfront charge)
    │
    ▼
Staff/Admin finishes processing, upload file:
POST /store/orders/:id/deliver
    │
    ▼
Order status: "delivered"
└── Cron auto-complete → "completed" + settlement + notify
```

### 8.3 Wallet Deposit Flow

```
User chooses to deposit coins
    │
    ▼
POST /wallet/deposit (provider: "payos", amount: 100000)
    │
    ▼
Server:
├── Calculate coinAmount = amountReal / exchangeRate
├── Create deposit_request (status: "pending")
├── Call PayOS API → receive checkout URL
└── Return checkout URL to frontend
    │
    ▼
User redirect → PayOS → payment
    │
    ▼
PayOS callback → POST /payment/payos/webhook
    │
    ▼
Server verify:
├── Verify signature
├── Check amount match
├── Check deposit_request exists & pending
    │
    ▼
MongoDB Transaction:
├── Update deposit_request → "completed"
├── Add user coins (wallet.balance += coinAmount)
├── Create transaction (type: "deposit")
└── Notify user (deposit_completed)
```

### 8.4 Blog Moderation Flow

```
Author writes article
    │
    ▼
POST /posts (status: "draft")
│ Edited by Author...
    ▼
POST /posts/:id/submit
    │
    ▼
Status: "pending" (submittedAt: now)
    │
    ▼
Staff seen in moderation queue
    │
    ├── APPROVE
    │   ▼
    │   Status: "published"
│ ├── Plus coin author (post_reward)
│ ├── Bonus multiplier if VIP
    │   ├── Update author stats
    │   ├── Notify author (post_approved)
    │   └── Trigger badge check
    │
    └── REJECT
        ▼
        Status: "rejected" (rejectionReason: "...")
        ├── Notify author (post_rejected)
└── Author can edit → draft → resubmit
```

### 8.5 Cart Checkout Flow (MVP)

```
User opens /cart
    │
    ▼
POST /cart/items (productId, quantity)
    │
    ▼
Server:
├── Validate product exists and status = active
├── Validate type = digital
├── Validate stock (if stock is set)
└── Upsert cart item snapshot (name, slug, unitPrice)
    │
    ▼
POST /cart/checkout
    │
    ▼
Server transaction:
├── Re-validate all cart products (latest price + availability)
├── Calculate subtotal/total
├── wallet.purchase(total)
├── Create order (status: paid, source: cart)
└── Clear cart items
    │
    ▼
Return order + empty cart
```

---

## 9. Security

### 9.1 Authentication

- **JWT Access Token:** Short-lived (15 minutes)
- **Refresh Token:** Long-lived (7 days), rotation on use
- **2FA (TOTP):** Google Authenticator compatible
- **Backup codes:** 10 codes, single-use, hashed storage
- **Password:** bcrypt (10 rounds)
- **Email verification** required

### 9.2 Authorization

- **Role-based:** Guest < Author < Staff < Admin
- **Granular permissions** override if needed
- **Resource ownership:** Users can only edit/delete their own data
- **Guards:** JwtAuthGuard (global), RolesGuard (per route)

### 9.3 Wallet Security

- **MongoDB transactions** for all money operations
- **Atomic operations** ($inc with $gte check)
- **Balance snapshot** (balanceBefore/After) in each transaction
- **Anti-fraud flags:** IP, user agent, suspicious patterns
- **Admin audit** for all manual adjustments
- **Rate limit** cho deposit requests

### 9.4 Input Validation

- **class-validator** on all DTOs
- **XSS sanitization** cho rich text content
- **MongoDB injection prevention** (Mongoose schema validation)
- **File upload:** type check, size limit, malware scan (optional)

### 9.5 API Security

- **Rate limiting (runtime):** custom in-memory limiter for `/auth/*` and `/payment/*`
- **Global ThrottlerModule:** planned
- **CORS:** Whitelist frontend origin
- **Security headers:** custom middleware
- **Helmet:** planned
- **Request timeout global 30s:** planned (not enforced globally yet)
- **Payload size limit:** Configurable per route

### 9.6 Data Protection

- **Password:** Never returned in API response
- **2FA secret:** Encrypted at rest
- **Payment tokens:** Never stored (use provider tokens)
- **File access:** Presigned URLs with expiry
- **Audit logs:** Track all sensitive operations
- **Soft delete** cho user data (GDPR consideration)

---

## 10. Frontend Readiness

### 10.1 FE Integration Priority (Updated 2026-03-26)

1. Auth + Profile
- Login form hỗ trợ 2 mode response:
  - Normal: `accessToken + refreshToken`
  - 2FA challenge: `requiresTwoFactor=true`, `twoFactorToken`, `expiresInSeconds`
- Build screens:
  - `/auth/2fa/enable` (setup challenge + QR/manual key)
  - `/auth/2fa/verify` (challenge sau login)
  - `/settings/security` (disable 2FA)

2. Notification Center (HTTP + WebSocket)
- Kết nối Socket.IO namespace `/notifications` với `handshake.auth.token`.
- Subscribe event: `notifications:ready`, `notifications:new`, `notifications:unread-count`, `notifications:read`, `notifications:read-all`, `notifications:error`.
- FE state sync:
  - list notification từ REST
  - unread badge realtime
  - optimistic UI cho mark-read/read-all

3. Tickets UI ✅
- User pages:
  - `/tickets`
  - `/tickets/:id`
- compose/reply/rate/reopen/close
- realtime subscribe `/tickets` + dedupe message merge + attachment upload (`/upload/attachment`)
- Staff/Admin pages:
  - `/tickets` (role-sensitive dashboard behavior)
  - admin full assignment controls
  - staff claim-to-self + operational status/internal-note on self-assigned
- Custom-order flow: mở ticket thread từ order detail.

4. Store Order Actions ✅
- Buyer order detail:
  - `/orders/:id/complete`
  - `/orders/:id/cancel`
  - `/orders/:id/refund-request`
- Staff store order detail:
  - `PATCH /store/orders/:id/status` with strict transition options by current status

5. Public Wiki ✅
- `/knowledge`: list/search/filter via `/wiki` + `/wiki/categories`
- `/knowledge/:slug`: detail via `/wiki/:slug`
- Helpful vote action for authenticated users via `/wiki/:id/helpful`

6. Admin Console
- `/admin/dashboard`:
  - `stats`
  - `revenue (from/to/groupBy)`
  - `users-growth (from/to/groupBy)`
- `/admin/audit-logs`:
  - filter `action`, `severity`, `userId`, `from`, `to`
  - pagination

7. Social + Gamification
- `/leaderboard`
- `/users/:id` social tab (followers/following)
- follow/unfollow actions
- badges:
  - `/badges`
  - `/badges/me`

### 10.2 Contract Notes For FE

- `POST /auth/login` có union response; FE phải branch logic theo `requiresTwoFactor`.
- `POST /auth/2fa/verify` dùng cho cả setup token và login challenge token.
- Notification WS hiện là single-instance (chưa Redis adapter), FE vẫn xử lý reconnect bình thường.
- Ticket WS contract:
  - namespace `/tickets`
  - client emits: `tickets:subscribe`, `tickets:unsubscribe`
  - server emits: `tickets:ready`, `tickets:subscribed`, `tickets:message`, `tickets:ticket-updated`, `tickets:error`
- Audit logs chỉ ghi mutation endpoints (`POST/PUT/PATCH/DELETE`), không kỳ vọng log cho GET.

### 10.3 Frontend Definition of Done

- [ ] Auth + 2FA UX hoàn chỉnh (happy path + expired/invalid challenge cases)
- [ ] Realtime notifications chạy ổn định, unread count đồng bộ REST/WS
- [x] Ticket conversation UX usable trên mobile + desktop (REST send + WS push + attachment upload)
- [x] Buyer order action UX (complete/cancel/refund-request) + ticket-linked feedback
- [x] Staff store order status update UI theo transition backend
- [x] Public wiki list/detail/helpful vote UI
- [ ] Admin dashboard + audit filters/pagination hoạt động đúng query params
- [ ] Social follow + leaderboard + badges hiển thị chuẩn
- [ ] E2E smoke cho các luồng chính: login(2FA), order→ticket, notify realtime, admin stats

---

## Changelog

| Date       | Version | Changes                                                      |
| ---------- | ------- | ------------------------------------------------------------ |
| 2026-03-09 | 1.0     | Initial documentation                                        |
| 2026-03-15 | 1.1     | Store switched to single-seller (Admin owner, Staff manager) |
| 2026-03-18 | 1.2     | Wallet module delivered: coin balances, transactions, PayOS deposit flow, anti-fraud and admin adjust APIs |
| 2026-03-19 | 1.3     | Subscription revamp + notifications: Free/Pro/VIP billing cycles, wallet-based purchase, auto-renew, reminder/renewal email + in-app notifications |
| 2026-03-24 | 1.4     | Restored alerts module + health runtime wiring, implemented Store MVP (`products`, `orders`, `reviews`, `store dashboard`), added cart APIs/schema/flow and updated roadmap markers (`planned`) in endpoint table |
| 2026-03-25 | 1.5     | Delivered backend upgrades: 2FA step-up login (TOTP + backup codes), notifications WS + blog/store/wallet integrations, tickets/admin tickets, admin dashboard + persistent audit logs, social follow APIs, gamification badges/leaderboard + seed/backfill scripts; added frontend readiness checklist |
| 2026-03-26 | 1.6     | Delivered ticket realtime WS (`/tickets`) + role-sensitive ticket operations + auto-assign policy; FE ticket detail realtime/attachments; FE buyer order complete/cancel/refund-request actions; FE staff store status update action; public wiki list/detail/helpful vote UI; refreshed readiness checklist |

---

> 📝 **Note:** This document is the main reference for the entire project. Updated when there are design changes.


