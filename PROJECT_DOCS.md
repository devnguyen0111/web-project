# 📋 PROJECT DOCUMENTATION

# Personal Website — Full-Stack Platform

> **Author:** DevNguyen0111
> **Created:** 2026-03-09
> **Version:** 1.3
> **Status:** Phase 3 In Progress (Wallet + Subscription Revamp Delivered)

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
| Cache      | Redis 7+                            | Session, rate limit, realtime (planned) |
| Queue      | Bull (@nestjs/bull)                 | Email, async jobs (planned)    |
| WebSocket  | Socket.io (@nestjs/websockets)      | Realtime notifications (planned) |
| Storage    | AWS S3 / Cloudinary                 | Files, images                  |
| Auth       | JWT + Refresh Token + 2FA (TOTP)    | Authentication                 |
| Payment    | PayOS (primary)                      | Deposit coins                  |
| Email      | Nodemailer (@nestjs-modules/mailer) | Transactional email            |
| API Docs   | Swagger (@nestjs/swagger)           | Auto-generated docs            |
| Validation | class-validator + class-transformer | Input validation               |
| Testing    | Jest                                | Unit + E2E tests               |

> Current status note (2026-03-19): Wallet + PayOS + Subscription Revamp + minimal subscription notifications are implemented. Redis/Bull/WebSocket are not enabled in the current codebase.

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
- Staff assignment + escalation
- Internal notes (buyer does not see)
- System auto messages (status changed, assigned)
- **SLA tracking:** First response due, resolution due
- Satisfaction rating (1-5) after resolution

### 3.4 💰 Wallet & Coin System

- Each user has a wallet: balance, frozenBalance, totalEarned, totalSpent
- **Deposit coins:** PayOS → deposit_requests → verify → add coins
- **Receive coins:** Approved articles, referral bonus, daily mission
- **Spending coins:** Buy goods, buy subscriptions
- **Admin (store owner) receives coin:** sale_income (after order is completed, minus platform fee)
- **Admin withdrawal:** withdrawal flow
- Full transaction history (balanceBefore/After)
- **Anti-fraud:** IP tracking, user agent, flagged transactions
- MongoDB transaction (session) for all wallet operations

### 3.5 🏅 Gamification

- **XP/Level system:** Get XP when active, auto level up
- **Badges:** Common → Uncommon → Rare → Epic → Legendary
- Badge conditions: posts_published, sales_count, login_streak, level_reached, etc.
- Secret badges (hidden until achieved)
- Badge rewards: coin + XP
- **Leaderboard:** Top contributors, buyers, level (weekly/monthly/alltime)
- Pre-computed leaderboard snapshots (cron job)

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

- **Realtime:** Planned via WebSocket (Socket.io), not enabled in current codebase
- **Types:** post_approved, order_new, ticket_reply, deposit_completed, badge_earned, level_up, etc.
- **Multi-channel:** In-app, Email, Push
- From user info (who caused the notification)
- Mark read / read all
- Unread count (HTTP API in current implementation)
- TTL 90 days (auto cleanup)

### 3.9 📚 Knowledge Base / Wiki

- Articles with Markdown content
- **Versioning:** Each edit saves changelog (version, editor, summary)
- **Hierarchy:** Parent/child articles, breadcrumb
- Helpful votes (Yes/No)
- Access control: Public / Pro only / VIP only
- Separate wiki categories
- Full-text search

### 3.10 ⭐ Review/Rating

- Review for **product**
- Aspect ratings: quality (1-5), delivery (1-5), communication (1-5)
- Verified purchase badge
- Staff/Admin reply
- Helpful count
- Report system
- Average rating auto-computed on product

### 3.11 🔐 Security & Admin

- **2FA:** TOTP (Google Authenticator) + backup codes
- **Audit logs:** All important actions (login, approve, refund, ban, role change)
- **Admin dashboard:** Overview stats, revenue chart, user growth
- **User management:** Ban/unban, change role, wallet adjust
- Rate limiting (ThrottlerModule)
- Input sanitization (XSS)
- Refresh token rotation

---

## 4. Database Design

### Collections Overview (20+)

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

---

### 4.1 users

```js
{
  _id: ObjectId,
  username: String,                    // unique, lowercase
  email: String,                       // unique
  password: String,                    // bcrypt
  displayName: String,
  avatar: String,
  bio: String,
  website: String,
  socialLinks: { github, twitter, linkedin },

  role: enum ["guest", "author", "staff", "admin"],
  permissions: [String],

  wallet: {
    balance: Number (min: 0),
    frozenBalance: Number,
    totalEarned: Number,
    totalSpent: Number,
    lifetimeDeposit: Number
  },

  subscription: {
    tier: enum ["free", "pro", "vip"],
    subscribedAt: Date,
    expiresAt: Date,
    autoRenew: Boolean
  },

  level: Number,
  xp: Number,
  xpToNextLevel: Number,

  stats: {
    postsPublished, totalPostViews, totalLikesReceived,
    commentsCount, productsSold, totalRevenue,
    ordersMade, followersCount, followingCount
  },

  twoFactor: {
    enabled: Boolean,
    secret: String,           // encrypted TOTP
    backupCodes: [String],    // hashed
    enabledAt: Date
  },

  refreshTokens: [{ token, device, ip, expiresAt, createdAt }],
  emailVerified: Boolean,

  followers: [ObjectId],
  following: [ObjectId],

  storeProfile: {
    shopName, shopDescription, shopBanner,
    rating, reviewsCount, verified, joinedAt
  },

  isBanned: Boolean,
  banReason: String,
  lastLoginAt: Date,
  lastActiveAt: Date,
  loginStreak: Number,
  referralCode: String,
  referredBy: ObjectId,

  createdAt: Date,
  updatedAt: Date
}

// Indexes:
// { username: 1 } unique
// { email: 1 } unique
// { referralCode: 1 } unique sparse
// { role: 1 }
// { "subscription.tier": 1 }
// { level: -1, xp: -1 }
// { "stats.postsPublished": -1 }
// { "stats.totalRevenue": -1 }
// { "storeProfile.rating": -1 }
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
  sellerId: ObjectId,                // always Admin userId (single store owner)
  name: String,
  slug: String,                        // unique
  description: String,
  shortDescription: String,
  images: [{ url, alt, order }],
  previewUrl: String,
  type: enum ["digital", "custom_order"],
  files: [{ filename, storagePath, size, mimeType, version, uploadedAt }],
  customFields: [{ _id, label, type, options, required, placeholder }],
  estimatedDays: { min, max },
  price: Number,
  originalPrice: Number,
  isOnSale: Boolean,
  saleEndsAt: Date,
  categoryId: ObjectId,
  tags: [String],
  salesCount: Number,
  rating: Number,
  reviewsCount: Number,
  viewsCount: Number,
  favoritesCount: Number,
  status: enum ["draft", "pending_review", "active", "paused", "rejected", "archived"],
  reviewedBy: ObjectId,
  rejectionReason: String,
  stock: Number,
  maxPerUser: Number,
  isFeatured: Boolean,
  subscriberDiscount: { pro: Number, vip: Number },
  createdAt: Date,
  updatedAt: Date
}

// Indexes:
// { slug: 1 } unique
// { sellerId: 1, status: 1 }
// { status: 1, categoryId: 1 }
// { type: 1, status: 1 }
// { rating: -1, salesCount: -1 }
// { name: "text", description: "text" }
```

### 4.11 orders

```js
{
  _id: ObjectId,
  orderNumber: String,                 // "ORD-20260309-0001"
  buyerId: ObjectId,
  sellerId: ObjectId,                // always Admin userId (single store owner)
  items: [{
    productId: ObjectId,
    productSnapshot: { name, type, price, image },
    quantity: Number,
    unitPrice: Number,
    discount: Number,
    subtotal: Number,
    customData: Mixed
  }],
  subtotal: Number,
  platformFee: Number,
  totalAmount: Number,
  sellerReceives: Number,
  buyerTransactionId: ObjectId,
  sellerTransactionId: ObjectId,
  status: enum [
    "pending", "paid",
    "quoted", "quote_accepted",
    "processing", "delivered", "completed",
    "cancelled", "refund_requested", "refunded", "disputed"
  ],
  quote: { price, estimatedDays, note, quotedAt, acceptedAt },
  deliveryFiles: [{ filename, storagePath, size, uploadedAt }],
  deliveredAt: Date,
  completedAt: Date,
  autoCompleteAt: Date,
  statusHistory: [{ from, to, note, changedBy, changedAt }],
  buyerNote: String,
  managerNote: String,
  adminNote: String,
  cancelReason: String,
  refund: { reason, requestedAt, processedBy, processedAt, amount },
  createdAt: Date,
  updatedAt: Date
}

// Indexes:
// { orderNumber: 1 } unique
// { buyerId: 1, status: 1, createdAt: -1 }
// { sellerId: 1, status: 1, createdAt: -1 }
// { status: 1, autoCompleteAt: 1 }
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
  type: enum [
    "post_approved","post_rejected","post_liked","post_commented","comment_replied",
    "order_new","order_status_changed","order_delivered","order_completed",
    "new_review","quote_received",
    "ticket_reply","ticket_resolved","ticket_assigned",
    "deposit_completed","coin_reward","withdrawal_completed",
    "new_follower","mention",
    "badge_earned","level_up",
    "subscription_expiring","subscription_expired",
    "system_announcement"
  ],
  title: String,
  message: String,
  reference: { model, id },
  actionUrl: String,
  fromUser: { userId, displayName, avatar },
  isRead: Boolean,
  readAt: Date,
  channels: { inApp, email, push },
  emailSentAt: Date,
  createdAt: Date
}

// Indexes:
// { userId: 1, isRead: 1, createdAt: -1 }
// { userId: 1, type: 1, createdAt: -1 }
// TTL: { createAt: 1, expireAfterSeconds: 7776000 } (90 days)
```

### 4.18 badges

```js
{
  _id: ObjectId,
  name: String,
  slug: String,
  description: String,
  icon: String,
  color: String,
  rarity: enum ["common","uncommon","rare","epic","legendary"],
  condition: {
    metric: String,    // "posts_published","sales_count","login_streak", etc.
    operator: String,  // "gte","eq"
    value: Number
  },
  coinReward: Number,
  xpReward: Number,
  isActive: Boolean,
  isSecret: Boolean,
  order: Number,
  createdAt: Date
}

// Indexes:
// { slug: 1 } unique
// { rarity: 1, order: 1 }
```

### 4.19 user_badges

```js
{
  _id: ObjectId,
  userId: ObjectId,
  badgeId: ObjectId,
  earnedAt: Date,
  isDisplayed: Boolean,
  badgeSnapshot: { name, icon, rarity }
}

// Indexes:
// { userId: 1, badgeId: 1 } unique compound
// { userId: 1, isDisplayed: 1 }
// { badgeId: 1 }
```

### 4.20 leaderboard_snapshots

```js
{
  _id: ObjectId,
  type: enum ["top_contributors","top_liked","top_buyers","top_level","top_streak"],
  period: enum ["weekly","monthly","alltime"],
  entries: [{
    rank, userId, username, displayName, avatar, level,
    score, scoreLabel
  }],
  generatedAt: Date,
  periodStart: Date,
  periodEnd: Date
}

// Indexes:
// { type: 1, period: 1, generatedAt: -1 }
```

### 4.21 audit_logs

```js
{
  _id: ObjectId,
  userId: ObjectId,
  userRole: String,
  ip: String,
  userAgent: String,
  action: String,    // "user.login","post.approve","wallet.admin_adjust", etc.
  target: { model, id },
  details: Mixed,    // { before: {...}, after: {...} }
  severity: enum ["info","warning","critical"],
  createdAt: Date
}

// Indexes:
// { userId: 1, createdAt: -1 }
// { action: 1, createdAt: -1 }
// { severity: 1, createdAt: -1 }
// TTL: { createdAt: 1, expireAfterSeconds: 15552000 } (180 days)
```

---

## 5. API Endpoints

### 5.1 Auth

| Method | Path                  | Auth   | Description     |
| ------ | --------------------- | ------ | --------------- |
| POST | /auth/register | Public | Register |
| POST | /auth/login | Public | Sign in |
| POST   | /auth/refresh         | Public | Refresh token   |
| POST | /auth/logout | User | Sign out |
| POST | /auth/forgot-password | Public | Send reset email |
| POST   | /auth/reset-password  | Public | Reset password  |
| POST | /auth/verify-email | Public | Email authentication |
| POST | /auth/2fa/enable | User | Enable 2FA |
| POST | /auth/2fa/verify | User | 2FA Authentication |
| POST | /auth/2fa/disable | User | Turn off 2FA |

### 5.2 Users

| Method | Path                 | Auth   | Description         |
| ------ | -------------------- | ------ | ------------------- |
| GET | /users/me | User | Personal profile |
| PATCH | /users/me | User | Update profile |
| GET | /users/:username | Public | Public profile |
| GET | /users/:id/followers | Public | List of followers |
| GET | /users/:id/following | Public | Following list |
| POST   | /users/:id/follow    | User   | Follow              |
| DELETE | /users/:id/follow    | User   | Unfollow            |
| GET | /users/leaderboard | Public | Ranking |

### 5.3 Blog — Posts

| Method | Path                | Auth         | Description         |
| ------ | ------------------- | ------------ | ------------------- |
| GET    | /posts              | Public       | Listing (published) |
| GET | /posts/:slug | Public | Article details |
| POST | /posts | Author+ | Create draft |
| PATCH | /posts/:id | Author (own) | Update post |
| DELETE | /posts/:id | Author (own) | Delete post |
| POST | /posts/:id/submit | Author (own) | Submit for approval |
| POST   | /posts/:id/like     | User         | Toggle like         |
| POST   | /posts/:id/bookmark | User         | Toggle bookmark     |
| GET | /posts/me | Author+ | My article |

### 5.4 Blog — Comments

| Method | Path                    | Auth       | Description        |
| ------ | ----------------------- | ---------- | ------------------ |
| GET | /posts/:postId/comments | Public | List of comments |
| POST | /posts/:postId/comments | User | Create a comment |
| PATCH | /comments/:id | User (own) | Edit comment |
| DELETE | /comments/:id | User (own) | Delete comments |

### 5.5 Blog — Polls

| Method | Path                        | Auth   | Description  |
| ------ | --------------------------- | ------ | ------------ |
| POST   | /posts/:postId/poll/vote    | User   | Vote poll    |
| GET | /posts/:postId/poll/results | Public | Poll results |

### 5.6 Blog — Moderation

| Method | Path                          | Auth        | Description     |
| ------ | ----------------------------- | ----------- | --------------- |
| GET | /moderation/posts | Staff/Admin | Post review queue |
| PATCH | /moderation/posts/:id/approve | Staff/Admin | Browse articles |
| PATCH | /moderation/posts/:id/reject | Staff/Admin | Reject article |
| GET | /moderation/stats | Staff/Admin | Browsing statistics |

### 5.7 Categories

| Method | Path            | Auth   | Description |
| ------ | --------------- | ------ | ----------- |
| GET | /categories | Public | List |
| POST | /categories | Admin | Create |
| PATCH | /categories/:id | Admin | Update |
| DELETE | /categories/:id | Admin | Delete |

### 5.8 Tags

| Method | Path              | Auth   | Description         |
| ------ | ----------------- | ------ | ------------------- |
| GET | /tags | Public | List (popular) |
| GET | /tags/:slug/posts | Public | Articles by tag |

### 5.9 Wiki

| Method | Path              | Auth        | Description                |
| ------ | ----------------- | ----------- | -------------------------- |
| GET | /wiki | Public | List of articles |
| GET | /wiki/:slug | Public | Article details |
| POST | /wiki | Staff/Admin | Create article |
| PATCH | /wiki/:id | Staff/Admin | Update (create new version) |
| DELETE | /wiki/:id | Admin | Delete/archive |
| POST   | /wiki/:id/helpful | User        | Vote helpful (yes/no)      |
| GET    | /wiki/categories  | Public      | Wiki categories            |

### 5.10 Store — Products

| Method | Path            | Auth        | Description    |
| ------ | --------------- | ----------- | -------------- |
| GET    | /products       | Public      | Listing        |
| GET | /products/:slug | Public | Details |
| POST | /products | Staff/Admin | Create product |
| PATCH | /products/:id | Staff/Admin | Update |
| DELETE | /products/:id   | Staff/Admin | Archive        |
| GET | /products/me | Staff/Admin | Store products |

### 5.11 Store — Orders

| Method | Path                       | Auth                     | Description              |
| ------ | -------------------------- | ------------------------ | ------------------------ |
| POST | /orders | User | Create order |
| GET | /orders/me | User | My order (buyer) |
| GET | /orders/:id | User (buyer)/Staff/Admin | Single details |
| POST | /orders/:id/complete | User (buyer) | Confirmation complete |
| POST | /orders/:id/cancel | User (buyer) | Cancel order |
| POST | /orders/:id/refund-request | User (buyer) | Request a Refund |
| GET    | /orders/:id/download       | User (buyer)             | Download file            |

### 5.12 Store — Management Orders

| Method | Path                      | Auth        | Description           |
| ------ | ------------------------- | ----------- | --------------------- |
| GET | /store/orders | Staff/Admin | Store orders |
| PATCH | /store/orders/:id/status | Staff/Admin | Status Update |
| POST | /store/orders/:id/quote | Staff/Admin | Custom order quote |
| POST | /store/orders/:id/deliver | Staff/Admin | Upload delivery file |
| GET    | /store/dashboard          | Staff/Admin | Revenue dashboard   |

### 5.13 Store — Reviews

| Method | Path                         | Auth         | Description      |
| ------ | ---------------------------- | ------------ | ---------------- |
| GET | /products/:productId/reviews | Public | Product reviews |
| POST | /products/:productId/reviews | User (buyer) | Create review |
| GET    | /store/reviews               | Public       | Store reviews    |
| POST   | /store/reviews               | User (buyer) | Review store     |
| PATCH  | /reviews/:id/reply           | Staff/Admin  | Reply review     |

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
| POST | /tickets | User | Create ticket |
| GET | /tickets/me | User | My Tickets |
| GET | /tickets/:id | User (own)/Staff | Details |
| POST | /tickets/:id/messages | User/Staff | Send message |
| PATCH | /tickets/:id/close | User (own) | Close ticket |
| POST | /tickets/:id/reopen | User (own) | Reopen |
| POST | /tickets/:id/rate | User (own) | Reviews |

### 5.17 Tickets — Staff

| Method | Path                             | Auth        | Description    |
| ------ | -------------------------------- | ----------- | -------------- |
| GET | /admin/tickets | Staff/Admin | All tickets |
| PATCH | /admin/tickets/:id/assign | Staff/Admin | Assignment |
| PATCH | /admin/tickets/:id/status | Staff/Admin | Change status |
| POST | /admin/tickets/:id/internal-note | Staff/Admin | Internal Notes |

### 5.18 Notifications

| Method | Path                           | Auth | Description         |
| ------ | ------------------------------ | ---- | ------------------- |
| GET    | /notifications/me              | User | List notifications  |
| GET    | /notifications/me/unread-count | User | Unread count        |
| POST   | /notifications/me/:id/read     | User | Mark one as read    |
| POST   | /notifications/me/read-all     | User | Mark all as read    |

### 5.19 Gamification

| Method | Path            | Auth   | Description    |
| ------ | --------------- | ------ | -------------- |
| GET | /badges | Public | All badges |
| GET | /badges/me | User | Badges reached |
| GET    | /referrals/me   | User   | Referral stats |
| GET    | /referrals/code | User   | Referral code  |

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
| POST | /upload/image | User | Upload photos |
| POST | /upload/file | Staff/Admin | Upload product files |
| POST   | /upload/attachment | User        | Upload attachment ticket |

### 5.22 Admin

| Method | Path                          | Auth  | Description      |
| ------ | ----------------------------- | ----- | ---------------- |
| GET    | /admin/dashboard/stats        | Admin | Overview numbers |
| GET    | /admin/dashboard/revenue      | Admin | Revenue chart  |
| GET    | /admin/dashboard/users-growth | Admin | User growth      |
| GET    | /admin/users                  | Admin | List all users   |
| PATCH | /admin/users/:id/role | Admin | Change role |
| POST   | /admin/users/:id/ban          | Admin | Ban user         |
| POST   | /admin/users/:id/unban        | Admin | Unban            |
| POST | /admin/wallet/adjust | Admin | Add/subtract coins |
| GET    | /admin/wallet/stats           | Admin | Wallet stats     |
| GET    | /admin/audit-logs             | Admin | Audit logs       |

**Total: ~95 endpoints**

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
    ├── auth/
    │   └── ...
    │
    ├── users/
    │   └── ...
    │
    ├── blog/
    │   └── ...
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
    │   └── schemas/
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

> Note: Store, ticket, wiki, gamification, and realtime queue modules remain in product roadmap scope, but they are not present in the current backend codebase.

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

- [ ] Products module: CRUD (staff/admin), listing, search
- [ ] Product moderation (pending_review)
- [ ] Orders module: create → wallet.purchase(), status flow
- [ ] Digital product: auto-deliver download link
- [ ] Custom order: quote flow (staff/admin quote → buyer accept)
- [ ] Delivery files upload
- [ ] Store dashboard: orders, revenue stats (staff/admin)
- [ ] Reviews module: product + store reviews, aspects, staff/admin reply
- [ ] Auto-complete cron (7 days after delivery)
- [ ] Platform fee calculation
- [ ] Secure file download (presigned URL)

**Result:** Store is open, buying and selling with coins.

---

### Phase 5 — Tickets + Notifications + Mail (6-7 days)

**Goal:** Email + notifications foundation (tickets/realtime remain pending)

**Tasks:**

- [ ] Tickets module: create, messages, assign, status, SLA
- [ ] Ticket admin: assign, internal notes, escalate
- [ ] Satisfaction rating
- [ ] Mail module: templates (HBS), async send via Bull queue
- [x] Email: verify, reset password, subscription reminders/renewal alerts
- [x] Notifications module: create, list, mark read (subscription scope)
- [ ] WebSocket gateway: realtime push
- [ ] Integrate notifications into old modules (blog, store, wallet)

**Result:** Partial delivery: email + subscription notification feed done; tickets/realtime still pending.

---

### Phase 6 — Gamification, Subscription & Polish (8-10 days)

**Goal:** Feature complete, production-ready

**Tasks:**

- [ ] Add gamification fields to User schema
- [ ] XP service: addXp, checkLevelUp
- [ ] Badges: templates, checkAndAward automatically
- [ ] Leaderboard: pre-computed snapshots (cron)
- [ ] Referral system: code, track, reward
- [ ] Social: follow/unfollow, profile page data
- [x] Subscription module: plans, purchase, cancel/auto-renew, history (quota-first)
- [ ] Subscription perks: bonus coin, discount, exclusive content
- [x] Subscription auto-renew/expiry cron with reminders + grace period
- [ ] Wiki/Knowledge base module
- [ ] 2FA: TOTP enable/verify/disable, backup codes
- [ ] Admin dashboard: stats, revenue, user growth, audit logs
- [ ] Seeder: badges, categories
- [ ] Rate limiting fine-tune
- [ ] Security review
- [ ] Complete API documentation

**Result:** In progress; only subscription core is delivered in this phase scope.

---

### Timeline

```
Phase 1 ████████░░░░░░░░░░░░░░░░░░░░░░ Week 1-2 (Foundation)
Phase 2 ████████████████░░░░░░░░░░░░░░ Week 2-3 (Blog) ✅
Phase 3 ░░░░░░░░░░░░░░████████░░░░░░░░ Week 4-5 (Wallet) ✅
Phase 4 ░░░░░░░░░░░░░░░░░░░░░░████████ Week 5-7 (Store)
Phase 5 ░░░░░░░░░░░░░░░░░░░░░░░░░░████ Week 7-8 (Support)
Phase 6 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░██ Week 9-11 (Polish)

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
Test server:
├── Product active? Stock enough?
├── Does Buyer have enough coins?
└── maxPerUser not exceeded?
    │
    ▼
MongoDB Transaction:
├── Minus coin buyer (wallet.balance -= totalAmount)
├── Create transaction (type: "purchase")
├── Create order (status: "paid")
├── Reduce stock
└── Auto set status → "delivered" (digital)
    │
    ▼
Order status: "delivered"
├── Generate presigned download URL
├── Notify buyer (order_delivered)
└── Set autoCompleteAt = now + 7 days
    │
    ▼
Cron job (or buyer click complete):
├── Status → "completed"
├── Add coin admin store (sellerReceives = total - platformFee)
├── Create transaction (type: "sale_income")
├── Create transaction (type: "platform_fee")
├── Update store statistics
└── Notify admin/staff (order_completed)
```

### 8.2 Order Flow — Custom Order

```
Buyer fills out the request form
    │
    ▼
POST /orders (productId, customData)
    │
    ▼
Order status: "pending" → "paid" (minus coins at base price)
    │
    ▼
Staff/Admin view requests and quotes:
POST /store/orders/:id/quote (price, estimatedDays, note)
    │
    ▼
Order status: "quoted"
├── Notify buyer (quote_received)
    │
    ▼
Buyer accepts or rejects:
├── Accept → status: "quote_accepted" → "processing"
│ └── Deduct additional coins if the price is higher than the base
│ or refund if the price is lower
└── Reject → status: "cancelled" → refund coins
    │
    ▼
Staff/Admin finishes processing, upload file:
POST /store/orders/:id/deliver
    │
    ▼
Order status: "delivered"
└── (continue as digital flow)
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

---

## 9. Security

### 9.1 Authentication

- **JWT Access Token:** Short-lived (15 minutes)
- **Refresh Token:** Long-lived (7 days), rotation on use
- **2FA (TOTP):** Google Authenticator compatible
- **Backup codes:** 10 codes, single-use, hashed storage
- **Password:** bcrypt (12 rounds)
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

- **Rate limiting:** ThrottlerModule (per IP, per user)
- **CORS:** Whitelist frontend origin
- **Helmet:** Security headers
- **Request timeout:** 30s default
- **Payload size limit:** Configurable per route

### 9.6 Data Protection

- **Password:** Never returned in API response
- **2FA secret:** Encrypted at rest
- **Payment tokens:** Never stored (use provider tokens)
- **File access:** Presigned URLs with expiry
- **Audit logs:** Track all sensitive operations
- **Soft delete** cho user data (GDPR consideration)

---

## Changelog

| Date       | Version | Changes                                                      |
| ---------- | ------- | ------------------------------------------------------------ |
| 2026-03-09 | 1.0     | Initial documentation                                        |
| 2026-03-15 | 1.1     | Store switched to single-seller (Admin owner, Staff manager) |

---

> 📝 **Note:** This document is the main reference for the entire project. Updated when there are design changes.


