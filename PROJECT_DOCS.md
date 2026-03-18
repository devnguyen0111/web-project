# 📋 PROJECT DOCUMENTATION

# Website Cá Nhân — Full-Stack Platform

> **Author:** DevNguyen0111
> **Created:** 2026-03-09
> **Version:** 1.1
> **Status:** Phase 2 Completed (Preparing Phase 3)

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

Website cá nhân đa chức năng bao gồm:

- **Blog** với hệ thống duyệt bài
- **Store** bán sản phẩm digital + đặt hàng custom (single-seller)
- **Ticket** hỗ trợ khách hàng
- **Wallet** hệ thống coin nội bộ
- **Gamification** XP/Level/Badge
- **Knowledge Base** tài liệu hướng dẫn
- **Subscription** gói VIP

---

## 2. Tech Stack

| Layer      | Technology                          | Mục đích                       |
| ---------- | ----------------------------------- | ------------------------------ |
| Frontend   | Next.js 16.1.6 + React 19 (App Router) | SSR/SSG, SEO, Dashboard     |
| Backend    | NestJS 11 + TypeScript              | REST API, modular architecture |
| Database   | MongoDB + Mongoose 9                | Document storage               |
| Cache      | Redis 7+                            | Session, rate limit, realtime  |
| Queue      | Bull (@nestjs/bull)                 | Email, async jobs              |
| WebSocket  | Socket.io (@nestjs/websockets)      | Realtime notifications         |
| Storage    | AWS S3 / Cloudinary                 | Files, images                  |
| Auth       | JWT + Refresh Token + 2FA (TOTP)    | Authentication                 |
| Payment    | VNPay, MoMo, Stripe                 | Nạp coin                       |
| Email      | Nodemailer (@nestjs-modules/mailer) | Transactional email            |
| API Docs   | Swagger (@nestjs/swagger)           | Auto-generated docs            |
| Validation | class-validator + class-transformer | Input validation               |
| Testing    | Jest                                | Unit + E2E tests               |

> Ghi chú trạng thái hiện tại (2026-03-18): backend/frontend đã hoàn tất phạm vi Blog Phase 2; Redis/Bull/WebSocket chưa bật trong codebase hiện tại.

---

## 3. Features Detail

### 3.1 📝 Blog System

- Editor hỗ trợ Markdown và Rich text
- **Roles:** Admin, Staff (duyệt bài), Author, Guest
- **Moderation queue:** Draft → Pending Review → Published / Rejected
- Author sửa bài bị reject → submit lại
- Tag system (separate collection, usage count)
- Category system (nested, multi-scope)
- Full-text search (title + content)
- Comment system: nested reply (max depth 3), likes, staff có thể ẩn comment
- **Poll/Vote** nhúng trong blog post
- Exclusive content (chỉ VIP xem)
- SEO metadata (metaTitle, metaDescription, canonicalUrl)
- **Coin reward** khi bài được duyệt (VIP nhận bonus multiplier)

### 3.2 🛒 Store

- **Digital products:** Upload file, preview, mô tả, giá (coin)
- **Custom orders:** Form yêu cầu → Staff/Admin báo giá → Buyer chấp nhận → Thanh toán → Delivery
- **Single-seller:** Chỉ Admin đăng bán sản phẩm; Staff quản lý vận hành (đơn hàng, báo giá, chăm sóc)
- Subscriber discount (Pro/VIP giảm giá %)
- Product moderation (pending_review trước khi active)
- Platform fee trên mỗi giao dịch
- Review/Rating với aspect scores (quality, delivery, communication)
- Staff/Admin reply cho reviews
- Auto-complete đơn hàng sau 7 ngày delivery

### 3.3 🎫 Ticket Support

- Tạo ticket liên kết với đơn hàng, sản phẩm, ví, tài khoản
- **Priority:** Low / Medium / High / Urgent
- **Status:** Open → Awaiting User → In Progress → Escalated → Resolved → Closed
- Staff assignment + escalation
- Internal notes (buyer không thấy)
- System auto messages (status changed, assigned)
- **SLA tracking:** First response due, resolution due
- Satisfaction rating (1-5) sau khi resolved

### 3.4 💰 Wallet & Coin System

- Mỗi user có ví: balance, frozenBalance, totalEarned, totalSpent
- **Nạp coin:** VNPay, MoMo, Stripe → deposit_requests → verify → cộng coin
- **Nhận coin:** Bài được duyệt, referral bonus, daily mission
- **Tiêu coin:** Mua hàng, mua subscription
- **Admin (store owner) nhận coin:** sale_income (sau khi order completed, trừ platform fee)
- **Admin rút tiền:** withdrawal flow
- Lịch sử giao dịch đầy đủ (balanceBefore/After)
- **Anti-fraud:** IP tracking, user agent, flagged transactions
- MongoDB transaction (session) cho mọi thao tác wallet

### 3.5 🏅 Gamification

- **XP/Level system:** Nhận XP khi hoạt động, auto level up
- **Badges:** Common → Uncommon → Rare → Epic → Legendary
- Badge conditions: posts_published, sales_count, login_streak, level_reached, etc.
- Secret badges (ẩn cho tới khi đạt)
- Badge rewards: coin + XP
- **Leaderboard:** Top contributors, buyers, level (weekly/monthly/alltime)
- Pre-computed leaderboard snapshots (cron job)

### 3.6 👤 Social

- Profile page: portfolio, bài viết, rank, badges
- Follow/Unfollow system
- Follower/Following counts

### 3.7 💳 Subscription

- **Tiers:** Free / Pro / VIP
- **Billing:** Monthly / Quarterly / Yearly
- **Perks:**
  - Extra coin reward (% bonus khi viết bài)
  - Store discount (%)
  - Priority support
  - Custom badge
  - Featured profile
  - Max file upload size tăng
  - Access exclusive content
- Auto-renew option
- Subscription history tracking

### 3.8 🔔 Notifications

- **Realtime** qua WebSocket (Socket.io)
- **Types:** post_approved, order_new, ticket_reply, deposit_completed, badge_earned, level_up, etc.
- **Multi-channel:** In-app, Email, Push
- From user info (ai gây ra notification)
- Mark read / read all
- Unread count (realtime update)
- TTL 90 ngày (auto cleanup)

### 3.9 📚 Knowledge Base / Wiki

- Articles với Markdown content
- **Versioning:** Mỗi edit lưu changelog (version, editor, summary)
- **Hierarchy:** Parent/child articles, breadcrumb
- Helpful votes (Yes/No)
- Access control: Public / Pro only / VIP only
- Separate wiki categories
- Full-text search

### 3.10 ⭐ Review/Rating

- Review cho **sản phẩm**
- Aspect ratings: quality (1-5), delivery (1-5), communication (1-5)
- Verified purchase badge
- Staff/Admin reply
- Helpful count
- Report system
- Average rating auto-computed trên product

### 3.11 🔐 Security & Admin

- **2FA:** TOTP (Google Authenticator) + backup codes
- **Audit logs:** Mọi action quan trọng (login, approve, refund, ban, role change)
- **Admin dashboard:** Overview stats, revenue chart, user growth
- **User management:** Ban/unban, change role, wallet adjust
- Rate limiting (ThrottlerModule)
- Input sanitization (XSS)
- Refresh token rotation

---

## 4. Database Design

### Collections Overview (20+)

| #   | Collection            | Scope        | Mô tả                                               |
| --- | --------------------- | ------------ | --------------------------------------------------- |
| 1   | users                 | Core         | Tài khoản, role, wallet, subscription, gamification |
| 2   | subscriptions         | Finance      | Lịch sử subscription                                |
| 3   | posts                 | Blog         | Bài viết, moderation, engagement, poll              |
| 4   | poll_votes            | Blog         | Phiếu vote của user                                 |
| 5   | post_comments         | Blog         | Comments nested                                     |
| 6   | categories            | Shared       | Categories cho blog/store/wiki                      |
| 7   | tags                  | Blog         | Tags với usage count                                |
| 8   | wiki_articles         | Wiki         | Tài liệu, versioning                                |
| 9   | wiki_categories       | Wiki         | Phân loại wiki                                      |
| 10  | products              | Store        | Sản phẩm digital/custom                             |
| 11  | orders                | Store        | Đơn hàng                                            |
| 12  | reviews               | Store        | Đánh giá sản phẩm/store                             |
| 13  | tickets               | Support      | Ticket hỗ trợ                                       |
| 14  | ticket_messages       | Support      | Tin nhắn trong ticket                               |
| 15  | transactions          | Finance      | Mọi giao dịch coin                                  |
| 16  | deposit_requests      | Finance      | Yêu cầu nạp tiền                                    |
| 17  | notifications         | System       | Thông báo                                           |
| 18  | badges                | Gamification | Badge templates                                     |
| 19  | user_badges           | Gamification | User đạt badge nào                                  |
| 20  | leaderboard_snapshots | Gamification | Bảng xếp hạng                                       |
| 21  | audit_logs            | System       | Nhật ký hệ thống                                    |

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
// TTL: { createdAt: 1, expireAfterSeconds: 7776000 } (90 ngày)
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
// TTL: { createdAt: 1, expireAfterSeconds: 15552000 } (180 ngày)
```

---

## 5. API Endpoints

### 5.1 Auth

| Method | Path                  | Auth   | Description     |
| ------ | --------------------- | ------ | --------------- |
| POST   | /auth/register        | Public | Đăng ký         |
| POST   | /auth/login           | Public | Đăng nhập       |
| POST   | /auth/refresh         | Public | Refresh token   |
| POST   | /auth/logout          | User   | Đăng xuất       |
| POST   | /auth/forgot-password | Public | Gửi email reset |
| POST   | /auth/reset-password  | Public | Reset password  |
| POST   | /auth/verify-email    | Public | Xác thực email  |
| POST   | /auth/2fa/enable      | User   | Bật 2FA         |
| POST   | /auth/2fa/verify      | User   | Xác thực 2FA    |
| POST   | /auth/2fa/disable     | User   | Tắt 2FA         |

### 5.2 Users

| Method | Path                 | Auth   | Description         |
| ------ | -------------------- | ------ | ------------------- |
| GET    | /users/me            | User   | Profile cá nhân     |
| PATCH  | /users/me            | User   | Cập nhật profile    |
| GET    | /users/:username     | Public | Profile công khai   |
| GET    | /users/:id/followers | Public | Danh sách followers |
| GET    | /users/:id/following | Public | Danh sách following |
| POST   | /users/:id/follow    | User   | Follow              |
| DELETE | /users/:id/follow    | User   | Unfollow            |
| GET    | /users/leaderboard   | Public | Bảng xếp hạng       |

### 5.3 Blog — Posts

| Method | Path                | Auth         | Description         |
| ------ | ------------------- | ------------ | ------------------- |
| GET    | /posts              | Public       | Listing (published) |
| GET    | /posts/:slug        | Public       | Chi tiết bài viết   |
| POST   | /posts              | Author+      | Tạo draft           |
| PATCH  | /posts/:id          | Author (own) | Cập nhật bài        |
| DELETE | /posts/:id          | Author (own) | Xóa bài             |
| POST   | /posts/:id/submit   | Author (own) | Submit duyệt        |
| POST   | /posts/:id/like     | User         | Toggle like         |
| POST   | /posts/:id/bookmark | User         | Toggle bookmark     |
| GET    | /posts/me           | Author+      | Bài viết của tôi    |

### 5.4 Blog — Comments

| Method | Path                    | Auth       | Description        |
| ------ | ----------------------- | ---------- | ------------------ |
| GET    | /posts/:postId/comments | Public     | Danh sách comments |
| POST   | /posts/:postId/comments | User       | Tạo comment        |
| PATCH  | /comments/:id           | User (own) | Sửa comment        |
| DELETE | /comments/:id           | User (own) | Xóa comment        |

### 5.5 Blog — Polls

| Method | Path                        | Auth   | Description  |
| ------ | --------------------------- | ------ | ------------ |
| POST   | /posts/:postId/poll/vote    | User   | Vote poll    |
| GET    | /posts/:postId/poll/results | Public | Kết quả poll |

### 5.6 Blog — Moderation

| Method | Path                          | Auth        | Description     |
| ------ | ----------------------------- | ----------- | --------------- |
| GET    | /moderation/posts             | Staff/Admin | Queue duyệt bài |
| PATCH  | /moderation/posts/:id/approve | Staff/Admin | Duyệt bài       |
| PATCH  | /moderation/posts/:id/reject  | Staff/Admin | Từ chối bài     |
| GET    | /moderation/stats             | Staff/Admin | Thống kê duyệt  |

### 5.7 Categories

| Method | Path            | Auth   | Description |
| ------ | --------------- | ------ | ----------- |
| GET    | /categories     | Public | Danh sách   |
| POST   | /categories     | Admin  | Tạo         |
| PATCH  | /categories/:id | Admin  | Cập nhật    |
| DELETE | /categories/:id | Admin  | Xóa         |

### 5.8 Tags

| Method | Path              | Auth   | Description         |
| ------ | ----------------- | ------ | ------------------- |
| GET    | /tags             | Public | Danh sách (popular) |
| GET    | /tags/:slug/posts | Public | Bài viết theo tag   |

### 5.9 Wiki

| Method | Path              | Auth        | Description                |
| ------ | ----------------- | ----------- | -------------------------- |
| GET    | /wiki             | Public      | Danh sách articles         |
| GET    | /wiki/:slug       | Public      | Chi tiết article           |
| POST   | /wiki             | Staff/Admin | Tạo article                |
| PATCH  | /wiki/:id         | Staff/Admin | Cập nhật (tạo version mới) |
| DELETE | /wiki/:id         | Admin       | Xóa/archive                |
| POST   | /wiki/:id/helpful | User        | Vote helpful (yes/no)      |
| GET    | /wiki/categories  | Public      | Wiki categories            |

### 5.10 Store — Products

| Method | Path            | Auth        | Description    |
| ------ | --------------- | ----------- | -------------- |
| GET    | /products       | Public      | Listing        |
| GET    | /products/:slug | Public      | Chi tiết       |
| POST   | /products       | Staff/Admin | Tạo sản phẩm   |
| PATCH  | /products/:id   | Staff/Admin | Cập nhật       |
| DELETE | /products/:id   | Staff/Admin | Archive        |
| GET    | /products/me    | Staff/Admin | Sản phẩm store |

### 5.11 Store — Orders

| Method | Path                       | Auth                     | Description              |
| ------ | -------------------------- | ------------------------ | ------------------------ |
| POST   | /orders                    | User                     | Tạo đơn hàng             |
| GET    | /orders/me                 | User                     | Đơn hàng của tôi (buyer) |
| GET    | /orders/:id                | User (buyer)/Staff/Admin | Chi tiết đơn             |
| POST   | /orders/:id/complete       | User (buyer)             | Xác nhận hoàn tất        |
| POST   | /orders/:id/cancel         | User (buyer)             | Hủy đơn                  |
| POST   | /orders/:id/refund-request | User (buyer)             | Yêu cầu hoàn tiền        |
| GET    | /orders/:id/download       | User (buyer)             | Download file            |

### 5.12 Store — Management Orders

| Method | Path                      | Auth        | Description           |
| ------ | ------------------------- | ----------- | --------------------- |
| GET    | /store/orders             | Staff/Admin | Đơn hàng store        |
| PATCH  | /store/orders/:id/status  | Staff/Admin | Cập nhật trạng thái   |
| POST   | /store/orders/:id/quote   | Staff/Admin | Báo giá custom order  |
| POST   | /store/orders/:id/deliver | Staff/Admin | Upload file giao hàng |
| GET    | /store/dashboard          | Staff/Admin | Revenue dashboard   |

### 5.13 Store — Reviews

| Method | Path                         | Auth         | Description      |
| ------ | ---------------------------- | ------------ | ---------------- |
| GET    | /products/:productId/reviews | Public       | Reviews sản phẩm |
| POST   | /products/:productId/reviews | User (buyer) | Tạo review       |
| GET    | /store/reviews               | Public       | Store reviews    |
| POST   | /store/reviews               | User (buyer) | Review store     |
| PATCH  | /reviews/:id/reply           | Staff/Admin  | Reply review     |

### 5.14 Wallet

| Method | Path                 | Auth | Description       |
| ------ | -------------------- | ---- | ----------------- |
| GET    | /wallet/balance      | User | Số dư             |
| GET    | /wallet/transactions | User | Lịch sử giao dịch |
| POST   | /wallet/deposit      | User | Tạo lệnh nạp      |
| GET    | /wallet/deposit/:id  | User | Trạng thái nạp    |

### 5.15 Payment Callbacks

| Method | Path                    | Auth            | Description    |
| ------ | ----------------------- | --------------- | -------------- |
| GET    | /payment/vnpay/ipn      | Public (verify) | VNPay callback |
| POST   | /payment/momo/ipn       | Public (verify) | MoMo callback  |
| POST   | /payment/stripe/webhook | Public (verify) | Stripe webhook |

### 5.16 Tickets

| Method | Path                  | Auth             | Description     |
| ------ | --------------------- | ---------------- | --------------- |
| POST   | /tickets              | User             | Tạo ticket      |
| GET    | /tickets/me           | User             | Tickets của tôi |
| GET    | /tickets/:id          | User (own)/Staff | Chi tiết        |
| POST   | /tickets/:id/messages | User/Staff       | Gửi tin nhắn    |
| PATCH  | /tickets/:id/close    | User (own)       | Đóng ticket     |
| POST   | /tickets/:id/reopen   | User (own)       | Mở lại          |
| POST   | /tickets/:id/rate     | User (own)       | Đánh giá        |

### 5.17 Tickets — Staff

| Method | Path                             | Auth        | Description    |
| ------ | -------------------------------- | ----------- | -------------- |
| GET    | /admin/tickets                   | Staff/Admin | Tất cả tickets |
| PATCH  | /admin/tickets/:id/assign        | Staff/Admin | Phân công      |
| PATCH  | /admin/tickets/:id/status        | Staff/Admin | Đổi trạng thái |
| POST   | /admin/tickets/:id/internal-note | Staff/Admin | Ghi chú nội bộ |

### 5.18 Notifications

| Method | Path                        | Auth | Description        |
| ------ | --------------------------- | ---- | ------------------ |
| GET    | /notifications              | User | Danh sách          |
| PATCH  | /notifications/:id/read     | User | Đánh dấu đã đọc    |
| POST   | /notifications/read-all     | User | Đọc tất cả         |
| GET    | /notifications/unread-count | User | Số chưa đọc        |
| WS     | /notifications              | User | WebSocket realtime |

### 5.19 Gamification

| Method | Path            | Auth   | Description    |
| ------ | --------------- | ------ | -------------- |
| GET    | /badges         | Public | Tất cả badges  |
| GET    | /badges/me      | User   | Badges đã đạt  |
| GET    | /referrals/me   | User   | Referral stats |
| GET    | /referrals/code | User   | Referral code  |

### 5.20 Subscription

| Method | Path                    | Auth   | Description           |
| ------ | ----------------------- | ------ | --------------------- |
| GET    | /subscriptions/plans    | Public | Danh sách gói         |
| POST   | /subscriptions/purchase | User   | Purchase subscription      |
| GET    | /subscriptions/me       | User   | Subscription hiện tại |
| POST   | /subscriptions/cancel   | User   | Hủy subscription      |

### 5.21 Upload

| Method | Path               | Auth        | Description              |
| ------ | ------------------ | ----------- | ------------------------ |
| POST   | /upload/image      | User        | Upload ảnh               |
| POST   | /upload/file       | Staff/Admin | Upload file sản phẩm     |
| POST   | /upload/attachment | User        | Upload attachment ticket |

### 5.22 Admin

| Method | Path                          | Auth  | Description      |
| ------ | ----------------------------- | ----- | ---------------- |
| GET    | /admin/dashboard/stats        | Admin | Overview numbers |
| GET    | /admin/dashboard/revenue      | Admin | Revenue chart  |
| GET    | /admin/dashboard/users-growth | Admin | User growth      |
| GET    | /admin/users                  | Admin | List all users   |
| PATCH  | /admin/users/:id/role         | Admin | Đổi role         |
| POST   | /admin/users/:id/ban          | Admin | Ban user         |
| POST   | /admin/users/:id/unban        | Admin | Unban            |
| POST   | /admin/wallet/adjust          | Admin | Cộng/trừ coin    |
| GET    | /admin/wallet/stats           | Admin | Wallet stats     |
| GET    | /admin/audit-logs             | Admin | Audit logs       |

**Tổng: ~95 endpoints**

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
    ├── config/                      # 7 files
    │   ├── app.config.ts
    │   ├── database.config.ts
    │   ├── jwt.config.ts
    │   ├── redis.config.ts
    │   ├── storage.config.ts
    │   ├── mail.config.ts
    │   └── payment.config.ts
    │
    ├── database/
    │   ├── database.module.ts
    │   └── seeders/
    │       ├── seeder.module.ts
    │       ├── seeder.service.ts
    │       ├── admin.seeder.ts
    │       ├── categories.seeder.ts
    │       ├── badges.seeder.ts
    │       └── missions.seeder.ts
    │
    ├── common/
    │   ├── constants/               # roles, statuses, enums
    │   ├── decorators/              # @CurrentUser, @Roles, @Public
    │   ├── guards/                  # JwtAuth, Roles, Throttle
    │   ├── filters/                 # HttpException, MongoException
    │   ├── interceptors/            # Response wrapper, Serialize
    │   ├── pipes/                   # ParseObjectId, Sanitize
    │   ├── dto/                     # Pagination
    │   └── utils/                   # slug, crypto, pagination
    │
    ├── auth/
    │   ├── auth.module.ts
    │   ├── auth.controller.ts
    │   ├── auth.service.ts
    │   ├── strategies/              # JWT, JWT-Refresh
    │   └── dto/
    │
    ├── users/
    │   ├── users.module.ts
    │   ├── users.controller.ts
    │   ├── users.service.ts
    │   ├── schemas/user.schema.ts
    │   └── dto/
    │
    ├── blog/
    │   ├── blog.module.ts
    │   ├── posts/                   # controller, service, schema, dto
    │   ├── comments/                # controller, service, schema, dto
    │   ├── moderation/              # controller, service, dto
    │   ├── categories/              # controller, service, schema, dto
    │   └── tags/                    # controller, service, schema, dto
    │
    ├── wiki/
    │   ├── wiki.module.ts
    │   ├── articles/                # controller, service, schema, dto
    │   └── wiki-categories/         # controller, service, schema
    │
    ├── store/
    │   ├── store.module.ts
    │   ├── products/                # controller, service, schema, dto
    │   ├── orders/                  # controller, admin.controller, service, schema, dto
    │   └── reviews/                 # controller, service, schema, dto
    │
    ├── wallet/
    │   ├── wallet.module.ts
    │   ├── wallet.controller.ts
    │   ├── wallet.admin.controller.ts
    │   ├── wallet.service.ts
    │   ├── payment/
    │   │   ├── payment.controller.ts
    │   │   ├── payment.service.ts
    │   │   └── providers/           # vnpay, momo, stripe
    │   ├── schemas/
    │   └── tests/                   # ⚠️ Critical tests
    │
    ├── tickets/
    │   ├── tickets.module.ts
    │   ├── tickets.controller.ts
    │   ├── tickets.admin.controller.ts
    │   ├── tickets.service.ts
    │   ├── schemas/
    │   └── dto/
    │
    ├── notifications/
    │   ├── notifications.module.ts
    │   ├── notifications.controller.ts
    │   ├── notifications.service.ts
    │   ├── notifications.gateway.ts # WebSocket
    │   └── schemas/
    │
    ├── gamification/
    │   ├── gamification.module.ts
    │   ├── xp/xp.service.ts
    │   ├── badges/                  # controller, service, schema
    │   ├── referrals/               # controller, service, schema
    │   └── leaderboard/             # service, schema
    │
    ├── subscriptions/
    │   ├── subscriptions.module.ts
    │   ├── subscriptions.controller.ts
    │   ├── subscriptions.service.ts
    │   └── schemas/
    │
    ├── upload/
    │   ├── upload.module.ts
    │   ├── upload.controller.ts
    │   ├── upload.service.ts
    │   └── providers/               # s3, cloudinary
    │
    ├── admin/
    │   ├── admin.module.ts
    │   ├── dashboard.controller.ts
    │   ├── users-management.controller.ts
    │   └── admin.service.ts
    │
    ├── mail/
    │   ├── mail.module.ts
    │   ├── mail.service.ts
    │   └── templates/               # .hbs email templates
    │
    └── jobs/
        ├── jobs.module.ts
        ├── queues/                  # email, notification, reward processors
        └── cron/                    # auto-complete, cleanup, leaderboard, subscription expiry
```

---

## 7. Phase Plan

### Phase 1 — Nền tảng (7-8 ngày)

**Mục tiêu:** Server chạy, đăng ký/đăng nhập, JWT auth

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
- [x] Admin seeder (tạo tài khoản admin đầu tiên)

**Kết quả:** Đăng ký, đăng nhập, JWT hoạt động. Swagger docs chạy.

---

### Phase 2 — Blog System (6-7 ngày)

**Mục tiêu:** Blog hoạt động, duyệt bài, comments, polls

**Tasks:**

- [x] Upload module (ảnh → MinIO/S3)
- [x] Categories module (CRUD, parentId-based nesting)
- [x] Tags module (CRUD, usage count)
- [x] Posts module: create draft, update, delete, submit, listing, search
- [x] Moderation module: pending queue, approve, reject
- [x] Comments module: nested replies, likes, hide (staff)
- [x] Poll system: embedded in post, vote, results
- [x] Full-text search (MongoDB text index + searchText)
- [x] Bookmark system

**Kết quả:** Hoàn tất backend + frontend cho Blog/Moderation (đã verify lint/test/build).

---

### Phase 3 — Wallet & Payment (8-10 ngày)

**Mục tiêu:** Hệ thống coin hoạt động, nạp tiền thật

**Tasks:**

- [ ] Thêm wallet fields vào User schema
- [ ] Transaction schema
- [ ] Wallet service: purchase(), reward(), refund() với MongoDB session
- [ ] Deposit request flow
- [ ] VNPay provider: tạo payment URL, IPN callback
- [ ] MoMo provider: tương tự
- [ ] Stripe provider: webhook
- [ ] Blog reward: cộng coin khi bài approved
- [ ] Admin wallet adjust
- [ ] Anti-fraud: IP logging, flagging
- [ ] **⚠️ Unit tests cho wallet transactions (BẮT BUỘC)**

**Kết quả:** Nạp coin, nhận coin, wallet hoạt động.

**Entry checklist trước khi bắt đầu Phase 3 (đã kiểm tra 2026-03-18):**

- [x] Backend build + test + e2e đang chạy được.
- [x] Frontend lint + test + build đang xanh.
- [x] Docs runtime (README backend/frontend) đã đồng bộ với code.
- [ ] Chốt provider thanh toán ưu tiên (VNPay/MoMo/Stripe) cho đợt triển khai đầu.
- [ ] Chốt thiết kế idempotency cho callback/IPN payment.

---

### Phase 4 — Store & Orders (7-8 ngày)

**Mục tiêu:** Mua bán sản phẩm, store dashboard (Admin owner + Staff manager)

**Tasks:**

- [ ] Products module: CRUD (staff/admin), listing, search
- [ ] Product moderation (pending_review)
- [ ] Orders module: create → wallet.purchase(), status flow
- [ ] Digital product: auto-deliver download link
- [ ] Custom order: quote flow (staff/admin báo giá → buyer accept)
- [ ] Delivery files upload
- [ ] Store dashboard: orders, revenue stats (staff/admin)
- [ ] Reviews module: product + store reviews, aspects, staff/admin reply
- [ ] Auto-complete cron (7 ngày after delivery)
- [ ] Platform fee calculation
- [ ] Secure file download (presigned URL)

**Kết quả:** Store hoạt động, mua bán bằng coin.

---

### Phase 5 — Tickets + Notifications + Mail (6-7 ngày)

**Mục tiêu:** Support system, realtime notifications, email

**Tasks:**

- [ ] Tickets module: create, messages, assign, status, SLA
- [ ] Ticket admin: assign, internal notes, escalate
- [ ] Satisfaction rating
- [ ] Mail module: templates (HBS), async send qua Bull queue
- [ ] Email: verify, reset password, order confirmed, post approved
- [ ] Notifications module: create, list, mark read
- [ ] WebSocket gateway: realtime push
- [ ] Tích hợp notifications vào modules cũ (blog, store, wallet)

**Kết quả:** Support system + realtime notification + email.

---

### Phase 6 — Gamification, Subscription & Polish (8-10 ngày)

**Mục tiêu:** Feature hoàn chỉnh, production-ready

**Tasks:**

- [ ] Thêm gamification fields vào User schema
- [ ] XP service: addXp, checkLevelUp
- [ ] Badges: templates, checkAndAward tự động
- [ ] Leaderboard: pre-computed snapshots (cron)
- [ ] Referral system: code, track, reward
- [ ] Social: follow/unfollow, profile page data
- [ ] Subscription module: plans, purchase, cancel, perks
- [ ] Subscription perks: bonus coin, discount, exclusive content
- [ ] Subscription expiry cron
- [ ] Wiki/Knowledge base module
- [ ] 2FA: TOTP enable/verify/disable, backup codes
- [ ] Admin dashboard: stats, revenue, user growth, audit logs
- [ ] Seeder: badges, categories
- [ ] Rate limiting fine-tune
- [ ] Security review
- [ ] API documentation hoàn chỉnh

**Kết quả:** Feature hoàn chỉnh, sẵn sàng kết nối frontend.

---

### Timeline

```
Phase 1 ████████░░░░░░░░░░░░░░░░░░░░░░  Tuần 1-2    (Nền tảng)
Phase 2 ████████████████░░░░░░░░░░░░░░  Tuần 2-3    (Blog) ✅
Phase 3 ░░░░░░░░░░░░░░████████░░░░░░░░  Tuần 4-5    (Wallet) ▶
Phase 4 ░░░░░░░░░░░░░░░░░░░░░░████████  Tuần 5-7    (Store)
Phase 5 ░░░░░░░░░░░░░░░░░░░░░░░░░░████  Tuần 7-8    (Support)
Phase 6 ░░░░░░░░░░░░░░░░░░░░░░░░░░░░██  Tuần 9-11   (Polish)

Tổng: ~11 tuần (2.5-3 tháng)
Thực tế: ~14-16 tuần (3.5-4 tháng) với debug + testing
```

---

## 8. Flow Diagrams

### 8.1 Order Flow — Digital Product

```
Buyer chọn sản phẩm
    │
    ▼
POST /orders (productId, quantity)
    │
    ▼
Server kiểm tra:
├── Product active? Stock đủ?
├── Buyer có đủ coin?
└── maxPerUser chưa vượt?
    │
    ▼
MongoDB Transaction:
├── Trừ coin buyer (wallet.balance -= totalAmount)
├── Tạo transaction (type: "purchase")
├── Tạo order (status: "paid")
├── Giảm stock
└── Auto set status → "delivered" (digital)
    │
    ▼
Order status: "delivered"
├── Generate presigned download URL
├── Notify buyer (order_delivered)
└── Set autoCompleteAt = now + 7 ngày
    │
    ▼
Cron job (hoặc buyer click complete):
├── Status → "completed"
├── Cộng coin admin store (sellerReceives = total - platformFee)
├── Tạo transaction (type: "sale_income")
├── Tạo transaction (type: "platform_fee")
├── Update store statistics
└── Notify admin/staff (order_completed)
```

### 8.2 Order Flow — Custom Order

```
Buyer điền form yêu cầu
    │
    ▼
POST /orders (productId, customData)
    │
    ▼
Order status: "pending" → "paid" (trừ coin theo giá base)
    │
    ▼
Staff/Admin xem yêu cầu, báo giá:
POST /store/orders/:id/quote (price, estimatedDays, note)
    │
    ▼
Order status: "quoted"
├── Notify buyer (quote_received)
    │
    ▼
Buyer chấp nhận hoặc từ chối:
├── Accept → status: "quote_accepted" → "processing"
│   └── Trừ thêm coin nếu giá cao hơn base
│       hoặc hoàn lại nếu giá thấp hơn
└── Reject → status: "cancelled" → hoàn coin
    │
    ▼
Staff/Admin xử lý xong, upload file:
POST /store/orders/:id/deliver
    │
    ▼
Order status: "delivered"
└── (tiếp tục như digital flow)
```

### 8.3 Wallet Deposit Flow

```
User chọn nạp coin
    │
    ▼
POST /wallet/deposit (provider: "vnpay", amount: 100000)
    │
    ▼
Server:
├── Tính coinAmount = amountReal / exchangeRate
├── Tạo deposit_request (status: "pending")
├── Gọi VNPay API → nhận paymentUrl
└── Return paymentUrl cho frontend
    │
    ▼
User redirect → VNPay → thanh toán
    │
    ▼
VNPay callback → GET /payment/vnpay/ipn
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
├── Cộng coin user (wallet.balance += coinAmount)
├── Tạo transaction (type: "deposit")
└── Notify user (deposit_completed)
```

### 8.4 Blog Moderation Flow

```
Author viết bài
    │
    ▼
POST /posts (status: "draft")
    │ Author chỉnh sửa...
    ▼
POST /posts/:id/submit
    │
    ▼
Status: "pending" (submittedAt: now)
    │
    ▼
Staff thấy trong moderation queue
    │
    ├── APPROVE
    │   ▼
    │   Status: "published"
    │   ├── Cộng coin author (post_reward)
    │   ├── Bonus multiplier nếu VIP
    │   ├── Update author stats
    │   ├── Notify author (post_approved)
    │   └── Trigger badge check
    │
    └── REJECT
        ▼
        Status: "rejected" (rejectionReason: "...")
        ├── Notify author (post_rejected)
        └── Author có thể sửa → draft → submit lại
```

---

## 9. Security

### 9.1 Authentication

- **JWT Access Token:** Short-lived (15 phút)
- **Refresh Token:** Long-lived (7 ngày), rotation on use
- **2FA (TOTP):** Google Authenticator compatible
- **Backup codes:** 10 codes, single-use, hashed storage
- **Password:** bcrypt (12 rounds)
- **Email verification** bắt buộc

### 9.2 Authorization

- **Role-based:** Guest < Author < Staff < Admin
- **Granular permissions** override nếu cần
- **Resource ownership:** User chỉ sửa/xóa data của mình
- **Guards:** JwtAuthGuard (global), RolesGuard (per route)

### 9.3 Wallet Security

- **MongoDB transactions** cho mọi thao tác tiền
- **Atomic operations** ($inc với $gte check)
- **Balance snapshot** (balanceBefore/After) trong mỗi transaction
- **Anti-fraud flags:** IP, user agent, suspicious patterns
- **Admin audit** cho mọi manual adjustment
- **Rate limit** cho deposit requests

### 9.4 Input Validation

- **class-validator** trên mọi DTO
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

> 📝 **Note:** Document này là reference chính cho toàn bộ dự án. Cập nhật khi có thay đổi design.


