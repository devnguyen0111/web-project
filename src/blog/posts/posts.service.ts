import {
  Optional,
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { Role } from '../../common/constants/roles.constant';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { toSlug } from '../../common/utils/slug.util';
import { MinioService } from '../../minio/minio.service';
import {
  SubscriptionPlanCode,
  SubscriptionStatus,
} from '../../subscriptions/subscription.constants';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { User } from '../../users/schemas/user.schema';
import { Category } from '../categories/schemas/category.schema';
import { Tag } from '../tags/schemas/tag.schema';
import { CreatePostDto } from './dto/create-post.dto';
import { PostsQueryDto } from './dto/posts-query.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import {
  Post,
  PostImageSize,
  PostBlockType,
  PostCalloutTone,
  PostDocument,
  PostEmbedProvider,
  PostListStyle,
  PostStatus,
} from './schemas/post.schema';
import { PollVote } from './schemas/poll-vote.schema';
import { WalletService } from '../../wallet/wallet.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationType } from '../../notifications/schemas/notification.schema';
import { GamificationService } from '../../gamification/gamification.service';

interface AuthUser {
  userId: string;
  role: Role;
}

interface FindPublishedBySlugOptions {
  shouldIncrementView?: boolean;
  viewerFingerprint?: string;
  viewerUserId?: string;
}

interface PollInput {
  question: string;
  options: Array<{ text: string }>;
  isPermanent?: boolean;
  endsAt?: string;
}

interface PostBlockInput {
  id?: string;
  type: PostBlockType;
  text?: string;
  level?: number;
  items?: string[];
  style?: PostListStyle;
  url?: string;
  alt?: string;
  caption?: string;
  size?: PostImageSize;
  code?: string;
  language?: string;
  provider?: PostEmbedProvider;
  embedUrl?: string;
  tone?: PostCalloutTone;
  todoItems?: Array<{
    text?: string;
    checked?: boolean;
  }>;
}

interface NormalizedPostBlock {
  id?: string;
  type: PostBlockType;
  text?: string;
  level?: number;
  items?: string[];
  style?: PostListStyle;
  url?: string;
  alt?: string;
  caption?: string;
  size?: PostImageSize;
  code?: string;
  language?: string;
  provider?: PostEmbedProvider;
  embedUrl?: string;
  tone?: PostCalloutTone;
  todoItems?: Array<{
    text: string;
    checked: boolean;
  }>;
}

type PostAuthor = {
  id: string;
  fullName: string;
  avatarUrl?: string;
  level: number;
};

type PostWithAuthor = PostDocument & {
  author?: PostAuthor | null;
};

type TableOfContentsItem = {
  id: string;
  text: string;
  level: 1 | 2 | 3;
};

type BlogPostCardV2 = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  coverImageUrl?: string;
  flags: {
    isExclusive: boolean;
    isFeatured: boolean;
    isPinned: boolean;
  };
  author: PostAuthor;
  metrics: {
    views: number;
    likesCount: number;
    commentsCount: number;
    readTimeMinutes: number;
    rewardCoins?: number;
  };
  publishedAt?: string;
};

type BlogPostDetailV2 = {
  id: string;
  slug: string;
  title: string;
  excerpt?: string;
  coverImageUrl?: string;
  flags: {
    isExclusive: boolean;
    isFeatured: boolean;
    isPinned: boolean;
  };
  author: PostAuthor;
  metrics: {
    views: number;
    likesCount: number;
    bookmarksCount: number;
    commentsCount: number;
    readTimeMinutes: number;
    rewardCoins?: number;
  };
  access: {
    locked: boolean;
    reason?: 'vip_required';
    upgradeUrl: '/subscription';
  };
  blocks: NormalizedPostBlock[];
  toc: TableOfContentsItem[];
  poll?: {
    question: string;
    options: Array<{ text: string; votes: number }>;
    totalVotes: number;
    isPermanent?: boolean;
    endsAt?: Date;
  };
};

@Injectable()
export class PostsService {
  private readonly viewDedupWindowMs = 15_000;
  private readonly recentViewTracker = new Map<string, number>();
  private transactionCapabilityChecked = false;
  private transactionsSupported = true;

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    @InjectModel(PollVote.name) private readonly pollVoteModel: Model<PollVote>,
    @InjectModel(Category.name) private readonly categoryModel: Model<Category>,
    @InjectModel(Tag.name) private readonly tagModel: Model<Tag>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly walletService: WalletService,
    private readonly configService: ConfigService,
    private readonly minioService: MinioService,
    @Optional()
    private readonly notificationsService?: NotificationsService,
    @Optional()
    private readonly gamificationService?: GamificationService,
  ) {}

  async createDraft(
    userId: string,
    payload: CreatePostDto,
  ): Promise<PostDocument> {
    const post = await this.executeInTransaction(async (session) => {
      await this.validateReferences(payload.categoryId, payload.tagIds);
      await this.subscriptionsService.consumePostQuota(userId, 1, session);

      const normalizedBlocks = this.normalizeBlocks(payload.blocks);
      const searchText = this.buildSearchText(
        payload.excerpt,
        normalizedBlocks,
      );
      const slug = await this.ensureUniqueSlug(payload.title);
      const createdPosts = await this.postModel.create(
        [
          {
            authorId: new Types.ObjectId(userId),
            title: payload.title,
            slug,
            excerpt: payload.excerpt,
            blocks: normalizedBlocks,
            searchText,
            content: searchText,
            isExclusive: payload.isExclusive === true,
            isFeatured: payload.isFeatured === true,
            isPinned: payload.isPinned === true,
            categoryId: payload.categoryId
              ? new Types.ObjectId(payload.categoryId)
              : undefined,
            tags: (payload.tagIds ?? []).map(
              (tagId) => new Types.ObjectId(tagId),
            ),
            status: PostStatus.DRAFT,
            poll: payload.poll ? this.normalizePoll(payload.poll) : undefined,
          },
        ],
        { session },
      );

      await this.tagModel.updateMany(
        { _id: { $in: payload.tagIds ?? [] } },
        { $inc: { usageCount: 1 } },
        { session },
      );

      return createdPosts[0];
    });

    return this.enrichPostWithAuthor(post);
  }

  async updatePost(
    postId: string,
    user: AuthUser,
    payload: UpdatePostDto,
  ): Promise<PostDocument> {
    const post = await this.postModel.findById(postId).exec();
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    this.ensureOwnership(post, user);
    const isModerator = this.isModerator(user.role);

    if (post.status === PostStatus.ARCHIVED && !isModerator) {
      throw new BadRequestException('Archived posts cannot be edited');
    }

    await this.validateReferences(payload.categoryId, payload.tagIds);

    if (payload.title && payload.title !== post.title) {
      post.slug = await this.ensureUniqueSlug(payload.title, post.id);
      post.title = payload.title;
    }

    if (payload.excerpt !== undefined) {
      post.excerpt = payload.excerpt;
    }

    if (payload.blocks !== undefined) {
      post.blocks = this.normalizeBlocks(payload.blocks);
    }

    if (payload.categoryId !== undefined) {
      post.categoryId = payload.categoryId
        ? new Types.ObjectId(payload.categoryId)
        : undefined;
    }

    if (payload.tagIds) {
      const oldTagIds = post.tags.map((tagId) => tagId.toString());
      const newTagIds = payload.tagIds;

      const removedTagIds = oldTagIds.filter(
        (tagId) => !newTagIds.includes(tagId),
      );
      const addedTagIds = newTagIds.filter(
        (tagId) => !oldTagIds.includes(tagId),
      );

      post.tags = newTagIds.map((tagId) => new Types.ObjectId(tagId));

      if (removedTagIds.length > 0) {
        await this.tagModel.updateMany(
          { _id: { $in: removedTagIds } },
          { $inc: { usageCount: -1 } },
        );
      }

      if (addedTagIds.length > 0) {
        await this.tagModel.updateMany(
          { _id: { $in: addedTagIds } },
          { $inc: { usageCount: 1 } },
        );
      }
    }

    if (payload.poll !== undefined) {
      post.poll = payload.poll ? this.normalizePoll(payload.poll) : undefined;
      await this.pollVoteModel.deleteMany({ postId: post._id });
    }

    if (payload.isExclusive !== undefined) {
      post.isExclusive = payload.isExclusive;
    }

    if (payload.isFeatured !== undefined) {
      post.isFeatured = payload.isFeatured;
    }

    if (payload.isPinned !== undefined) {
      post.isPinned = payload.isPinned;
    }

    if (!isModerator && post.status !== PostStatus.DRAFT) {
      this.movePostToPendingReview(post);
    }

    post.searchText = this.buildSearchText(
      post.excerpt,
      post.blocks as unknown as NormalizedPostBlock[],
    );
    post.content = post.searchText;

    await post.save();
    return this.enrichPostWithAuthor(post);
  }

  async uploadCoverImage(
    postId: string,
    user: AuthUser,
    file: {
      buffer: Buffer;
      size: number;
      mimetype?: string;
      originalname?: string;
    },
  ): Promise<PostDocument> {
    const post = await this.postModel.findById(postId).exec();
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    this.ensureOwnership(post, user);
    const isModerator = this.isModerator(user.role);

    if (post.status === PostStatus.ARCHIVED && !isModerator) {
      throw new BadRequestException('Archived posts cannot be edited');
    }

    const oldCoverImageUrl = post.coverImageUrl;
    const blogImagesBucket = this.minioService.getBucket('blogImages');

    const upload = await this.minioService.uploadFile(
      blogImagesBucket,
      file,
      `posts/${post.id}`,
    );

    post.coverImageUrl = upload.url;

    if (!isModerator && post.status !== PostStatus.DRAFT) {
      this.movePostToPendingReview(post);
    }

    await post.save();

    if (oldCoverImageUrl && oldCoverImageUrl !== upload.url) {
      await this.minioService.removeObjectByUrl(
        blogImagesBucket,
        oldCoverImageUrl,
      );
    }

    return this.enrichPostWithAuthor(post);
  }

  async uploadBlockImage(
    userId: string,
    file: {
      buffer: Buffer;
      size: number;
      mimetype?: string;
      originalname?: string;
    },
  ): Promise<{
    bucketName: string;
    objectName: string;
    etag: string;
    url: string;
  }> {
    const blogImagesBucket = this.minioService.getBucket('blogImages');
    return this.minioService.uploadFile(
      blogImagesBucket,
      file,
      `posts/blocks/${userId}`,
    );
  }

  async deletePost(postId: string, user: AuthUser) {
    const post = await this.postModel.findById(postId).exec();
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    this.ensureOwnership(post, user);
    this.ensureModeratorDeleteScope(post, user);

    await Promise.all([
      this.postModel.findByIdAndDelete(postId).exec(),
      this.pollVoteModel.deleteMany({ postId: post._id }).exec(),
      this.tagModel.updateMany(
        { _id: { $in: post.tags.map((tagId) => tagId.toString()) } },
        { $inc: { usageCount: -1 } },
      ),
    ]);

    return { message: 'Post deleted successfully' };
  }

  async submitForReview(postId: string, user: AuthUser): Promise<PostDocument> {
    const post = await this.postModel.findById(postId).exec();
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    this.ensureOwnership(post, user);

    if (![PostStatus.DRAFT, PostStatus.REJECTED].includes(post.status)) {
      throw new BadRequestException(
        'Only draft/rejected posts can be submitted',
      );
    }

    post.status = PostStatus.PENDING;
    post.submittedAt = new Date();
    post.reviewedBy = undefined;
    post.reviewedAt = undefined;
    post.publishedAt = undefined;
    post.rejectionReason = undefined;

    await post.save();
    return this.enrichPostWithAuthor(post);
  }

  async listPublished(
    query: PostsQueryDto,
  ): Promise<PaginatedResponseDto<BlogPostCardV2>> {
    const filter: Record<string, unknown> = {
      status: PostStatus.PUBLISHED,
    };

    if (query.search) {
      filter.$or = [
        { title: { $regex: query.search, $options: 'i' } },
        { searchText: { $regex: query.search, $options: 'i' } },
        { content: { $regex: query.search, $options: 'i' } },
      ];
    }

    if (query.categoryId) {
      filter.categoryId = new Types.ObjectId(query.categoryId);
    }

    if (query.tagId) {
      filter.tags = new Types.ObjectId(query.tagId);
    }

    const skip = (query.page - 1) * query.limit;

    const [data, total] = await Promise.all([
      this.postModel
        .find(filter)
        .sort({ isPinned: -1, isFeatured: -1, publishedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(query.limit)
        .lean(),
      this.postModel.countDocuments(filter),
    ]);
    const enrichedPosts = await this.enrichPostsWithAuthor(data as PostDocument[]);
    const cards = enrichedPosts.map((post) => this.toBlogPostCardV2(post));

    return new PaginatedResponseDto(
      cards,
      total,
      query.page,
      query.limit,
    );
  }

  async listMyPosts(
    userId: string,
    query: PostsQueryDto,
  ): Promise<PaginatedResponseDto<PostDocument>> {
    const filter: Record<string, unknown> = {
      authorId: new Types.ObjectId(userId),
    };

    if (query.status) {
      filter.status = query.status;
    }

    const skip = (query.page - 1) * query.limit;

    const [data, total] = await Promise.all([
      this.postModel
        .find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(query.limit)
        .lean(),
      this.postModel.countDocuments(filter),
    ]);
    const enrichedPosts = await this.enrichPostsWithAuthor(
      data as PostDocument[],
    );

    return new PaginatedResponseDto(
      enrichedPosts,
      total,
      query.page,
      query.limit,
    );
  }

  async findMyPostById(postId: string, user: AuthUser): Promise<PostDocument> {
    const post = await this.postModel.findById(postId).exec();
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    this.ensureOwnership(post, user);
    return this.enrichPostWithAuthor(post);
  }

  async findPublishedBySlug(
    slug: string,
    options: FindPublishedBySlugOptions = {},
  ): Promise<BlogPostDetailV2> {
    const post = await this.postModel
      .findOne({ slug, status: PostStatus.PUBLISHED })
      .exec();
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const shouldIncrementView = options.shouldIncrementView ?? true;
    const shouldCountByFingerprint = shouldIncrementView
      ? this.shouldCountViewByFingerprint(slug, options.viewerFingerprint)
      : false;

    if (shouldIncrementView && shouldCountByFingerprint) {
      await this.postModel.updateOne({ _id: post._id }, { $inc: { views: 1 } });
      post.views += 1;
    }

    const enrichedPost = await this.enrichPostWithAuthor(post);
    const isViewerVip = await this.isViewerVipActive(options.viewerUserId);
    const locked = enrichedPost.isExclusive === true && !isViewerVip;
    return this.toBlogPostDetailV2(enrichedPost, locked);
  }

  private shouldCountViewByFingerprint(
    slug: string,
    viewerFingerprint?: string,
  ): boolean {
    if (!viewerFingerprint) {
      return true;
    }

    const dedupKey = `${slug}:${viewerFingerprint}`;
    const now = Date.now();
    const previousTimestamp = this.recentViewTracker.get(dedupKey);

    if (
      previousTimestamp !== undefined &&
      now - previousTimestamp < this.viewDedupWindowMs
    ) {
      return false;
    }

    this.recentViewTracker.set(dedupKey, now);
    this.cleanupRecentViewTracker(now);
    return true;
  }

  private cleanupRecentViewTracker(now: number): void {
    if (this.recentViewTracker.size < 1000) {
      return;
    }

    for (const [key, timestamp] of this.recentViewTracker) {
      if (now - timestamp >= this.viewDedupWindowMs) {
        this.recentViewTracker.delete(key);
      }
    }
  }

  async toggleLike(postId: string, userId: string) {
    const post = await this.postModel.findById(postId).exec();
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (post.status !== PostStatus.PUBLISHED) {
      throw new BadRequestException('Only published posts can be liked');
    }

    const userObjectId = new Types.ObjectId(userId);
    const alreadyLiked = post.likes.some((item) => item.toString() === userId);

    if (alreadyLiked) {
      await this.postModel.updateOne(
        { _id: post._id },
        {
          $pull: { likes: userObjectId },
          $inc: { likesCount: -1 },
        },
      );
      return { liked: false, likesCount: Math.max(post.likesCount - 1, 0) };
    }

    await this.postModel.updateOne(
      { _id: post._id },
      {
        $addToSet: { likes: userObjectId },
        $inc: { likesCount: 1 },
      },
    );

    return { liked: true, likesCount: post.likesCount + 1 };
  }

  async getLikeStatus(postId: string, userId: string) {
    const post = await this.postModel
      .findById(postId)
      .select('likes likesCount status')
      .exec();

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (post.status !== PostStatus.PUBLISHED) {
      throw new BadRequestException(
        'Like status is available for published posts only',
      );
    }

    return {
      liked: post.likes.some((item) => item.toString() === userId),
      likesCount: post.likesCount,
    };
  }

  async toggleBookmark(postId: string, userId: string) {
    const post = await this.postModel.findById(postId).exec();
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const userObjectId = new Types.ObjectId(userId);
    const alreadyBookmarked = post.bookmarks.some(
      (item) => item.toString() === userId,
    );

    if (alreadyBookmarked) {
      await this.postModel.updateOne(
        { _id: post._id },
        {
          $pull: { bookmarks: userObjectId },
          $inc: { bookmarksCount: -1 },
        },
      );
      return { bookmarked: false };
    }

    await this.postModel.updateOne(
      { _id: post._id },
      {
        $addToSet: { bookmarks: userObjectId },
        $inc: { bookmarksCount: 1 },
      },
    );

    return { bookmarked: true };
  }

  async votePoll(postId: string, userId: string, optionIndex: number) {
    const post = await this.postModel.findById(postId).exec();
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (!post.poll || post.poll.options.length === 0) {
      throw new BadRequestException('This post has no poll');
    }

    if (this.isPollClosed(post.poll)) {
      throw new BadRequestException('This poll has ended');
    }

    if (optionIndex < 0 || optionIndex >= post.poll.options.length) {
      throw new BadRequestException('Invalid poll option index');
    }

    const userObjectId = new Types.ObjectId(userId);
    const existingVote = await this.pollVoteModel
      .findOne({ postId: post._id, userId: userObjectId })
      .exec();

    if (!existingVote) {
      await this.pollVoteModel.create({
        postId: post._id,
        userId: userObjectId,
        optionIndex,
      });

      post.poll.options[optionIndex].votes += 1;
      post.poll.totalVotes += 1;
      await post.save();

      return { voted: true };
    }

    if (existingVote.optionIndex === optionIndex) {
      return { voted: true, unchanged: true };
    }

    post.poll.options[existingVote.optionIndex].votes -= 1;
    post.poll.options[optionIndex].votes += 1;
    existingVote.optionIndex = optionIndex;

    await Promise.all([post.save(), existingVote.save()]);

    return { voted: true, changed: true };
  }

  async pollResults(postId: string) {
    const post = await this.postModel.findById(postId).select('poll').lean();

    if (!post?.poll) {
      throw new NotFoundException('Poll not found');
    }

    return post.poll;
  }

  private normalizePoll(poll: PollInput) {
    const isPermanent = poll.isPermanent ?? !poll.endsAt;
    const normalizedEndsAt = poll.endsAt ? new Date(poll.endsAt) : undefined;

    if (!isPermanent) {
      if (!normalizedEndsAt || Number.isNaN(normalizedEndsAt.getTime())) {
        throw new BadRequestException(
          'Poll endsAt is required when poll is not permanent',
        );
      }

      if (normalizedEndsAt.getTime() <= Date.now()) {
        throw new BadRequestException(
          'Poll endsAt must be a future datetime for non-permanent poll',
        );
      }
    }

    return {
      question: poll.question,
      options: poll.options.map((option) => ({
        text: option.text,
        votes: 0,
      })),
      totalVotes: 0,
      isPermanent,
      endsAt: isPermanent ? undefined : normalizedEndsAt,
    };
  }

  private isPollClosed(poll: {
    isPermanent?: boolean;
    endsAt?: Date;
  }): boolean {
    const isPermanent = poll.isPermanent ?? !poll.endsAt;
    if (isPermanent) {
      return false;
    }

    if (!poll.endsAt) {
      return true;
    }

    return poll.endsAt.getTime() <= Date.now();
  }

  async listPending(
    query: PostsQueryDto,
  ): Promise<PaginatedResponseDto<PostDocument>> {
    const filter: Record<string, unknown> = { status: PostStatus.PENDING };

    const skip = (query.page - 1) * query.limit;

    const [data, total] = await Promise.all([
      this.postModel
        .find(filter)
        .sort({ submittedAt: 1, createdAt: 1 })
        .skip(skip)
        .limit(query.limit)
        .lean(),
      this.postModel.countDocuments(filter),
    ]);
    const enrichedPosts = await this.enrichPostsWithAuthor(
      data as PostDocument[],
    );

    return new PaginatedResponseDto(
      enrichedPosts,
      total,
      query.page,
      query.limit,
    );
  }

  async findPendingById(postId: string): Promise<PostDocument> {
    const post = await this.postModel.findById(postId).exec();
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (post.status !== PostStatus.PENDING) {
      throw new BadRequestException(
        'Only pending posts can be viewed in moderation detail',
      );
    }

    return this.enrichPostWithAuthor(post);
  }

  async approve(postId: string, reviewerId: string): Promise<PostDocument> {
    const post = await this.executeInTransaction(async (session) => {
      const post = await this.postModel
        .findById(postId)
        .session(session)
        .exec();
      if (!post) {
        throw new NotFoundException('Post not found');
      }

      if (post.status !== PostStatus.PENDING) {
        throw new BadRequestException('Only pending posts can be approved');
      }

      post.status = PostStatus.PUBLISHED;
      post.reviewedBy = new Types.ObjectId(reviewerId);
      post.reviewedAt = new Date();
      post.publishedAt = new Date();
      post.rejectionReason = undefined;

      const rewardCoins = this.getPostRewardCoins();
      const coinToVndRate = this.getCoinToVndRate();
      const rewardAmount = this.toWalletAmountFromCoins(
        rewardCoins,
        coinToVndRate,
      );
      if (rewardAmount > 0) {
        await this.walletService.reward(
          post.authorId.toString(),
          rewardAmount,
          {
            description: `Reward for approved post "${post.title}"`,
            note: `Post ${post.id} approved by reviewer ${reviewerId}`,
            reference: {
              model: 'post',
              id: post.id,
            },
            processedBy: reviewerId,
            idempotencyKey: `post-reward:${post.id}`,
            metadata: {
              postId: post.id,
              reviewerId,
              rewardCoins,
              rewardAmount,
              coinToVndRate,
            },
          },
          session,
        );
      }

      await post.save({ session });
      return this.enrichPostWithAuthor(post);
    });

    await this.safeNotifyPostModeration(
      post.authorId.toString(),
      NotificationType.BLOG_POST_APPROVED,
      'Your post has been approved',
      post.title,
      {
        postId: post.id,
        slug: post.slug,
        reviewedBy: reviewerId,
      },
    );
    await this.gamificationService
      ?.recordPostApproved(post.authorId.toString(), post.id)
      .catch(() => undefined);

    return post;
  }

  async reject(
    postId: string,
    reviewerId: string,
    reason: string,
  ): Promise<PostDocument> {
    const post = await this.postModel.findById(postId).exec();
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (post.status !== PostStatus.PENDING) {
      throw new BadRequestException('Only pending posts can be rejected');
    }

    post.status = PostStatus.REJECTED;
    post.reviewedBy = new Types.ObjectId(reviewerId);
    post.reviewedAt = new Date();
    post.rejectionReason = reason;

    await post.save();
    const enriched = await this.enrichPostWithAuthor(post);

    await this.safeNotifyPostModeration(
      post.authorId.toString(),
      NotificationType.BLOG_POST_REJECTED,
      'Your post was rejected by moderation',
      post.title,
      {
        postId: post.id,
        slug: post.slug,
        reviewedBy: reviewerId,
        reason,
      },
    );

    return enriched;
  }

  async getModerationStats() {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      pending,
      published,
      rejected,
      draft,
      reviewedLast7Days,
      approvedLast7Days,
      rejectedLast7Days,
    ] = await Promise.all([
      this.postModel.countDocuments({ status: PostStatus.PENDING }),
      this.postModel.countDocuments({ status: PostStatus.PUBLISHED }),
      this.postModel.countDocuments({ status: PostStatus.REJECTED }),
      this.postModel.countDocuments({ status: PostStatus.DRAFT }),
      this.postModel.countDocuments({
        reviewedAt: { $gte: since },
      }),
      this.postModel.countDocuments({
        status: PostStatus.PUBLISHED,
        reviewedAt: { $gte: since },
      }),
      this.postModel.countDocuments({
        status: PostStatus.REJECTED,
        reviewedAt: { $gte: since },
      }),
    ]);

    return {
      pending,
      published,
      rejected,
      draft,
      reviewedLast7Days,
      approvedLast7Days,
      rejectedLast7Days,
      generatedAt: new Date().toISOString(),
    };
  }

  private async safeNotifyPostModeration(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    if (!this.notificationsService) {
      return;
    }

    await this.notificationsService
      .createBlogNotification({
        userId,
        type,
        title,
        message,
        metadata,
      })
      .catch(() => undefined);
  }

  private async executeInTransaction<T>(
    callback: (session: ClientSession) => Promise<T>,
    session?: ClientSession,
  ): Promise<T> {
    if (session) {
      return callback(session);
    }

    const startedSession = await this.connection.startSession();
    try {
      const shouldUseTransactions = await this.canUseTransactions();
      if (shouldUseTransactions) {
        try {
          let result!: T;
          await startedSession.withTransaction(async () => {
            result = await callback(startedSession);
          });
          return result;
        } catch (error) {
          if (!this.isTransactionUnsupportedError(error)) {
            throw error;
          }

          this.transactionsSupported = false;
        }
      }

      return await callback(startedSession);
    } finally {
      await startedSession.endSession();
    }
  }

  private async canUseTransactions(): Promise<boolean> {
    if (this.transactionCapabilityChecked) {
      return this.transactionsSupported;
    }

    try {
      const db = this.connection.db;
      if (!db) {
        throw new Error('MongoDB connection is not ready');
      }

      const hello = await db.admin().command({ hello: 1 });
      const isReplicaSetMember = Boolean(hello?.setName);
      const isMongos = hello?.msg === 'isdbgrid';
      this.transactionsSupported = isReplicaSetMember || isMongos;
    } catch {
      this.transactionsSupported = true;
    } finally {
      this.transactionCapabilityChecked = true;
    }

    return this.transactionsSupported;
  }

  private isTransactionUnsupportedError(error: unknown): boolean {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : '';

    if (
      message.includes(
        'Transaction numbers are only allowed on a replica set member or mongos',
      )
    ) {
      return true;
    }

    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? (error as { code?: unknown }).code
        : undefined;

    return code === 20;
  }

  private getPostRewardCoins(): number {
    const configuredReward = this.configService.get<number>(
      'wallet.postRewardCoins',
    );
    if (!configuredReward || !Number.isFinite(configuredReward)) {
      return 1;
    }

    return configuredReward > 0 ? configuredReward : 0;
  }

  private getCoinToVndRate(): number {
    const configuredRate = this.configService.get<number>(
      'wallet.coinToVndRate',
    );
    if (!configuredRate || !Number.isFinite(configuredRate)) {
      return 1000;
    }

    return configuredRate > 0 ? configuredRate : 1000;
  }

  private toWalletAmountFromCoins(
    amountCoins: number,
    coinToVndRate: number,
  ): number {
    if (!Number.isFinite(amountCoins) || amountCoins <= 0) {
      return 0;
    }

    return Math.round(amountCoins * coinToVndRate);
  }

  private ensureOwnership(post: PostDocument, user: AuthUser): void {
    if (this.isModerator(user.role)) {
      return;
    }

    if (post.authorId.toString() !== user.userId) {
      throw new ForbiddenException('You can only modify your own posts');
    }
  }

  private isModerator(role: Role): boolean {
    return role === Role.STAFF || role === Role.ADMIN;
  }

  private ensureModeratorDeleteScope(post: PostDocument, user: AuthUser): void {
    if (user.role !== Role.STAFF) {
      return;
    }

    if (post.status !== PostStatus.PUBLISHED) {
      throw new ForbiddenException(
        'Staff can only delete approved (published) posts',
      );
    }
  }

  private movePostToPendingReview(post: PostDocument): void {
    post.status = PostStatus.PENDING;
    post.submittedAt = new Date();
    post.reviewedBy = undefined;
    post.reviewedAt = undefined;
    post.rejectionReason = undefined;
    post.publishedAt = undefined;
  }

  private toBlogPostCardV2(post: PostDocument): BlogPostCardV2 {
    const enrichedPost = post as PostWithAuthor;
    const author = enrichedPost.author ?? {
      id: post.authorId.toString(),
      fullName: '[Unknown author]',
      level: 1,
    };
    const rewardCoins = this.getPostRewardCoins();

    return {
      id: post.id,
      slug: post.slug,
      title: post.title,
      excerpt: this.resolveExcerpt(post.excerpt, post.blocks as NormalizedPostBlock[]),
      coverImageUrl: post.coverImageUrl,
      flags: {
        isExclusive: post.isExclusive === true,
        isFeatured: post.isFeatured === true,
        isPinned: post.isPinned === true,
      },
      author,
      metrics: {
        views: post.views,
        likesCount: post.likesCount,
        commentsCount: post.commentsCount,
        readTimeMinutes: this.calculateReadTimeMinutes(
          post.blocks as NormalizedPostBlock[],
          post.excerpt,
        ),
        rewardCoins: rewardCoins > 0 ? rewardCoins : undefined,
      },
      publishedAt: this.toIsoString(post.publishedAt),
    };
  }

  private toBlogPostDetailV2(
    post: PostDocument,
    locked: boolean,
  ): BlogPostDetailV2 {
    const enrichedPost = post as PostWithAuthor;
    const author = enrichedPost.author ?? {
      id: post.authorId.toString(),
      fullName: '[Unknown author]',
      level: 1,
    };
    const normalizedBlocks = post.blocks as NormalizedPostBlock[];
    const blocks = locked ? [] : normalizedBlocks;
    const rewardCoins = this.getPostRewardCoins();

    return {
      id: post.id,
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      coverImageUrl: post.coverImageUrl,
      flags: {
        isExclusive: post.isExclusive === true,
        isFeatured: post.isFeatured === true,
        isPinned: post.isPinned === true,
      },
      author,
      metrics: {
        views: post.views,
        likesCount: post.likesCount,
        bookmarksCount: post.bookmarksCount,
        commentsCount: post.commentsCount,
        readTimeMinutes: this.calculateReadTimeMinutes(normalizedBlocks, post.excerpt),
        rewardCoins: rewardCoins > 0 ? rewardCoins : undefined,
      },
      access: {
        locked,
        reason: locked ? 'vip_required' : undefined,
        upgradeUrl: '/subscription',
      },
      blocks,
      toc: locked ? [] : this.buildTableOfContents(normalizedBlocks),
      poll: post.poll
        ? {
            question: post.poll.question,
            options: post.poll.options.map((option) => ({
              text: option.text,
              votes: option.votes,
            })),
            totalVotes: post.poll.totalVotes,
            isPermanent: post.poll.isPermanent,
            endsAt: post.poll.endsAt,
          }
        : undefined,
    };
  }

  private buildTableOfContents(blocks: NormalizedPostBlock[]): TableOfContentsItem[] {
    const usedIds = new Set<string>();
    const toc: TableOfContentsItem[] = [];

    blocks.forEach((block, index) => {
      if (
        block.type !== PostBlockType.HEADING ||
        !block.text ||
        !block.level ||
        block.level < 1 ||
        block.level > 3
      ) {
        return;
      }

      const baseId =
        this.normalizeOptionalString(block.id) ??
        this.slugifyHeadingText(block.text) ??
        `heading-${index + 1}`;
      const uniqueId = this.ensureUniqueTocId(baseId, usedIds);

      toc.push({
        id: uniqueId,
        text: block.text,
        level: block.level as 1 | 2 | 3,
      });
    });

    return toc;
  }

  private ensureUniqueTocId(baseId: string, usedIds: Set<string>): string {
    if (!usedIds.has(baseId)) {
      usedIds.add(baseId);
      return baseId;
    }

    let suffix = 2;
    while (usedIds.has(`${baseId}-${suffix}`)) {
      suffix += 1;
    }

    const nextId = `${baseId}-${suffix}`;
    usedIds.add(nextId);
    return nextId;
  }

  private slugifyHeadingText(text: string): string | undefined {
    const slug = text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
    return slug || undefined;
  }

  private resolveExcerpt(
    excerpt: string | undefined,
    blocks: NormalizedPostBlock[],
  ): string {
    const normalizedExcerpt = this.normalizeOptionalString(excerpt);
    if (normalizedExcerpt) {
      return normalizedExcerpt;
    }

    const blockText = this.extractTextFromBlocks(blocks, 320);
    return blockText || 'No preview available.';
  }

  private calculateReadTimeMinutes(
    blocks: NormalizedPostBlock[],
    excerpt?: string,
  ): number {
    const text = [this.normalizeOptionalString(excerpt) ?? '', this.extractTextFromBlocks(blocks, 5000)]
      .join(' ')
      .trim();
    if (!text) {
      return 1;
    }

    const words = text.split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.ceil(words / 220));
  }

  private extractTextFromBlocks(
    blocks: NormalizedPostBlock[],
    maxLength: number,
  ): string {
    const chunks: string[] = [];

    blocks.forEach((block) => {
      switch (block.type) {
        case PostBlockType.PARAGRAPH:
        case PostBlockType.HEADING:
        case PostBlockType.QUOTE:
        case PostBlockType.CALLOUT:
          if (block.text) {
            chunks.push(block.text);
          }
          break;
        case PostBlockType.LIST:
          if (block.items?.length) {
            chunks.push(...block.items);
          }
          break;
        case PostBlockType.IMAGE:
          if (block.alt) {
            chunks.push(block.alt);
          }
          if (block.caption) {
            chunks.push(block.caption);
          }
          break;
        case PostBlockType.CODE:
          if (block.code) {
            chunks.push(block.code.slice(0, 500));
          }
          break;
        case PostBlockType.TODO:
          if (block.todoItems?.length) {
            chunks.push(...block.todoItems.map((item) => item.text));
          }
          break;
        case PostBlockType.EMBED:
          if (block.embedUrl) {
            chunks.push(block.embedUrl);
          }
          break;
        default:
          break;
      }
    });

    const combined = chunks.join(' ').replace(/\s+/g, ' ').trim();
    if (combined.length <= maxLength) {
      return combined;
    }
    return combined.slice(0, Math.max(maxLength - 3, 1)).trimEnd() + '...';
  }

  private toIsoString(value?: Date): string | undefined {
    if (!value) {
      return undefined;
    }

    try {
      return new Date(value).toISOString();
    } catch {
      return undefined;
    }
  }

  private async isViewerVipActive(viewerUserId?: string): Promise<boolean> {
    if (!viewerUserId) {
      return false;
    }

    const user = await this.userModel
      .findById(viewerUserId)
      .select('subscription')
      .lean();
    if (!user?.subscription) {
      return false;
    }

    return (
      user.subscription.status === SubscriptionStatus.ACTIVE &&
      user.subscription.planCode === SubscriptionPlanCode.VIP
    );
  }

  private async enrichPostsWithAuthor(
    posts: PostDocument[],
  ): Promise<PostDocument[]> {
    if (posts.length === 0) {
      return [];
    }

    const authorIds = [
      ...new Set(posts.map((post) => post.authorId.toString())),
    ];
    const authors = await this.userModel
      .find({ _id: { $in: authorIds } })
      .select('fullName avatarUrl gamification.level')
      .lean();

    const authorMap = new Map<string, PostAuthor>(
      authors.map((author) => [
        author._id.toString(),
        {
          id: author._id.toString(),
          fullName: author.fullName,
          avatarUrl: author.avatarUrl,
          level:
            typeof author.gamification?.level === 'number'
              ? author.gamification.level
              : 1,
        },
      ]),
    );

    return posts.map((post) => {
      const normalizedPost =
        typeof (post as { toObject?: () => object }).toObject === 'function'
          ? ((post as { toObject: () => object }).toObject() as PostWithAuthor)
          : (post as PostWithAuthor);

      const authorId = post.authorId.toString();
      const author = authorMap.get(authorId);

      return {
        ...normalizedPost,
        author: author ?? {
          id: authorId,
          fullName: '[Unknown author]',
          level: 1,
        },
      } as unknown as PostDocument;
    });
  }

  private async enrichPostWithAuthor(
    post: PostDocument,
  ): Promise<PostDocument> {
    const [enrichedPost] = await this.enrichPostsWithAuthor([post]);
    return enrichedPost;
  }

  private normalizeBlocks(rawBlocks: PostBlockInput[]): NormalizedPostBlock[] {
    if (!Array.isArray(rawBlocks) || rawBlocks.length === 0) {
      throw new BadRequestException(
        'Post must contain at least one content block',
      );
    }

    return rawBlocks.map((block, index) => this.normalizeBlock(block, index));
  }

  private normalizeBlock(
    block: PostBlockInput,
    index: number,
  ): NormalizedPostBlock {
    const id = this.normalizeOptionalString(block.id);

    switch (block.type) {
      case PostBlockType.PARAGRAPH:
      case PostBlockType.QUOTE: {
        const type =
          block.type === PostBlockType.QUOTE
            ? PostBlockType.QUOTE
            : PostBlockType.PARAGRAPH;

        return {
          id,
          type,
          text: this.normalizeRequiredString(block.text, 'text', index),
        };
      }
      case PostBlockType.HEADING: {
        return {
          id,
          type: PostBlockType.HEADING,
          text: this.normalizeRequiredString(block.text, 'text', index),
          level: this.normalizeHeadingLevel(block.level, index),
        };
      }
      case PostBlockType.LIST: {
        const items = (block.items ?? [])
          .map((item) => item?.trim())
          .filter((item): item is string => Boolean(item));

        if (items.length === 0) {
          throw new BadRequestException(
            `Block at index ${index} must have at least one non-empty list item`,
          );
        }

        return {
          id,
          type: PostBlockType.LIST,
          items,
          style:
            block.style === PostListStyle.ORDERED
              ? PostListStyle.ORDERED
              : PostListStyle.UNORDERED,
        };
      }
      case PostBlockType.IMAGE: {
        return {
          id,
          type: PostBlockType.IMAGE,
          url: this.normalizeRequiredString(block.url, 'url', index),
          alt: this.normalizeOptionalString(block.alt),
          caption: this.normalizeOptionalString(block.caption),
          size: this.normalizeImageSize(block.size),
        };
      }
      case PostBlockType.CODE: {
        const rawCode = block.code ?? '';
        const code = rawCode.trim();

        if (!code) {
          throw new BadRequestException(
            `Block at index ${index} requires non-empty code`,
          );
        }

        return {
          id,
          type: PostBlockType.CODE,
          code,
          language: this.normalizeOptionalString(block.language),
        };
      }
      case PostBlockType.DIVIDER: {
        return {
          id,
          type: PostBlockType.DIVIDER,
        };
      }
      case PostBlockType.EMBED: {
        return {
          id,
          type: PostBlockType.EMBED,
          provider: this.normalizeEmbedProvider(block.provider, index),
          embedUrl: this.normalizeRequiredString(block.embedUrl, 'embedUrl', index),
        };
      }
      case PostBlockType.CALLOUT: {
        return {
          id,
          type: PostBlockType.CALLOUT,
          text: this.normalizeRequiredString(block.text, 'text', index),
          tone: this.normalizeCalloutTone(block.tone),
        };
      }
      case PostBlockType.TODO: {
        const todoItems = this.normalizeTodoItems(block.todoItems, index);
        return {
          id,
          type: PostBlockType.TODO,
          todoItems,
        };
      }
      default:
        throw new BadRequestException(
          `Unsupported block type at index ${index}`,
        );
    }
  }

  private buildSearchText(
    excerpt: string | undefined,
    blocks: NormalizedPostBlock[],
  ): string {
    const tokens: string[] = [];
    const normalizedExcerpt = this.normalizeOptionalString(excerpt);

    if (normalizedExcerpt) {
      tokens.push(normalizedExcerpt);
    }

    for (const block of blocks) {
      switch (block.type) {
        case PostBlockType.PARAGRAPH:
        case PostBlockType.HEADING:
        case PostBlockType.QUOTE:
        case PostBlockType.CALLOUT:
          if (block.text) {
            tokens.push(block.text);
          }
          break;
        case PostBlockType.LIST:
          if (block.items?.length) {
            tokens.push(...block.items);
          }
          break;
        case PostBlockType.IMAGE:
          if (block.alt) {
            tokens.push(block.alt);
          }
          if (block.caption) {
            tokens.push(block.caption);
          }
          break;
        case PostBlockType.CODE:
          if (block.code) {
            tokens.push(block.code.slice(0, 500));
          }
          break;
        case PostBlockType.EMBED:
          if (block.embedUrl) {
            tokens.push(block.embedUrl);
          }
          break;
        case PostBlockType.TODO:
          if (block.todoItems?.length) {
            tokens.push(...block.todoItems.map((item) => item.text));
          }
          break;
        default:
          break;
      }
    }

    return tokens.join(' ').replace(/\s+/g, ' ').trim();
  }

  private normalizeRequiredString(
    value: string | undefined,
    fieldName: string,
    index: number,
  ): string {
    const normalized = this.normalizeOptionalString(value);

    if (!normalized) {
      throw new BadRequestException(
        `Block at index ${index} requires non-empty "${fieldName}"`,
      );
    }

    return normalized;
  }

  private normalizeOptionalString(value?: string): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim();
    return normalized ? normalized : undefined;
  }

  private normalizeHeadingLevel(
    level: number | undefined,
    index: number,
  ): number {
    if (
      typeof level !== 'number' ||
      !Number.isInteger(level) ||
      level < 1 ||
      level > 4
    ) {
      throw new BadRequestException(
        `Block at index ${index} requires heading level between 1 and 4`,
      );
    }

    return level;
  }

  private normalizeImageSize(size: PostImageSize | undefined): PostImageSize {
    if (
      size === PostImageSize.SMALL ||
      size === PostImageSize.MEDIUM ||
      size === PostImageSize.LARGE
    ) {
      return size;
    }

    return PostImageSize.MEDIUM;
  }

  private normalizeEmbedProvider(
    provider: PostEmbedProvider | undefined,
    index: number,
  ): PostEmbedProvider {
    if (
      provider === PostEmbedProvider.YOUTUBE ||
      provider === PostEmbedProvider.TWITTER
    ) {
      return provider;
    }

    throw new BadRequestException(
      `Block at index ${index} requires a valid embed provider`,
    );
  }

  private normalizeCalloutTone(
    tone: PostCalloutTone | undefined,
  ): PostCalloutTone {
    if (
      tone === PostCalloutTone.INFO ||
      tone === PostCalloutTone.SUCCESS ||
      tone === PostCalloutTone.WARNING ||
      tone === PostCalloutTone.DANGER
    ) {
      return tone;
    }

    return PostCalloutTone.INFO;
  }

  private normalizeTodoItems(
    rawTodoItems: Array<{ text?: string; checked?: boolean }> | undefined,
    index: number,
  ): Array<{ text: string; checked: boolean }> {
    const todoItems = (rawTodoItems ?? [])
      .map((item) => ({
        text: this.normalizeOptionalString(item?.text),
        checked: item?.checked === true,
      }))
      .filter((item): item is { text: string; checked: boolean } => !!item.text);

    if (todoItems.length === 0) {
      throw new BadRequestException(
        `Block at index ${index} must have at least one todo item`,
      );
    }

    return todoItems;
  }

  private async validateReferences(
    categoryId?: string,
    tagIds?: string[],
  ): Promise<void> {
    if (categoryId) {
      const categoryExists = await this.categoryModel.exists({
        _id: categoryId,
      });
      if (!categoryExists) {
        throw new BadRequestException('Invalid categoryId');
      }
    }

    if (tagIds && tagIds.length > 0) {
      const tagsCount = await this.tagModel.countDocuments({
        _id: { $in: tagIds },
      });
      if (tagsCount !== tagIds.length) {
        throw new BadRequestException('One or more tagIds are invalid');
      }
    }
  }

  private async ensureUniqueSlug(
    title: string,
    ignoreId?: string,
  ): Promise<string> {
    const baseSlug = toSlug(title);
    let slug = baseSlug;
    let index = 1;

    while (true) {
      const existing = await this.postModel.findOne({ slug }).exec();
      if (!existing || existing.id === ignoreId) {
        return slug;
      }

      slug = `${baseSlug}-${index}`;
      index += 1;
    }
  }
}
