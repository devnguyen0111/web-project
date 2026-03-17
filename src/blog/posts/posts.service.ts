import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Role } from '../../common/constants/roles.constant';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { toSlug } from '../../common/utils/slug.util';
import { MinioService } from '../../minio/minio.service';
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
  PostDocument,
  PostListStyle,
  PostStatus,
} from './schemas/post.schema';
import { PollVote } from './schemas/poll-vote.schema';

interface AuthUser {
  userId: string;
  role: Role;
}

interface FindPublishedBySlugOptions {
  shouldIncrementView?: boolean;
  viewerFingerprint?: string;
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
}

type PostAuthor = {
  id: string;
  fullName: string;
  avatarUrl?: string;
};

type PostWithAuthor = PostDocument & {
  author?: PostAuthor | null;
};

@Injectable()
export class PostsService {
  private readonly viewDedupWindowMs = 15_000;
  private readonly recentViewTracker = new Map<string, number>();

  constructor(
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    @InjectModel(PollVote.name) private readonly pollVoteModel: Model<PollVote>,
    @InjectModel(Category.name) private readonly categoryModel: Model<Category>,
    @InjectModel(Tag.name) private readonly tagModel: Model<Tag>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly minioService: MinioService,
  ) {}

  async createDraft(
    userId: string,
    payload: CreatePostDto,
  ): Promise<PostDocument> {
    await this.validateReferences(payload.categoryId, payload.tagIds);

    const normalizedBlocks = this.normalizeBlocks(payload.blocks);
    const searchText = this.buildSearchText(payload.excerpt, normalizedBlocks);
    const slug = await this.ensureUniqueSlug(payload.title);
    const post = await this.postModel.create({
      authorId: new Types.ObjectId(userId),
      title: payload.title,
      slug,
      excerpt: payload.excerpt,
      blocks: normalizedBlocks,
      searchText,
      content: searchText,
      categoryId: payload.categoryId
        ? new Types.ObjectId(payload.categoryId)
        : undefined,
      tags: (payload.tagIds ?? []).map((tagId) => new Types.ObjectId(tagId)),
      status: PostStatus.DRAFT,
      poll: payload.poll ? this.normalizePoll(payload.poll) : undefined,
    });

    await this.tagModel.updateMany(
      { _id: { $in: payload.tagIds ?? [] } },
      { $inc: { usageCount: 1 } },
    );

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
  ): Promise<PaginatedResponseDto<PostDocument>> {
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
        .sort({ publishedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(query.limit)
        .lean(),
      this.postModel.countDocuments(filter),
    ]);
    const enrichedPosts = await this.enrichPostsWithAuthor(data as PostDocument[]);

    return new PaginatedResponseDto(
      enrichedPosts,
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
    const enrichedPosts = await this.enrichPostsWithAuthor(data as PostDocument[]);

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
  ): Promise<PostDocument> {
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

    return this.enrichPostWithAuthor(post);
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
    const enrichedPosts = await this.enrichPostsWithAuthor(data as PostDocument[]);

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
    const post = await this.postModel.findById(postId).exec();
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

    await post.save();
    return this.enrichPostWithAuthor(post);
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
    return this.enrichPostWithAuthor(post);
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

  private async enrichPostsWithAuthor(
    posts: PostDocument[],
  ): Promise<PostDocument[]> {
    if (posts.length === 0) {
      return [];
    }

    const authorIds = [...new Set(posts.map((post) => post.authorId.toString()))];
    const authors = await this.userModel
      .find({ _id: { $in: authorIds } })
      .select('fullName avatarUrl')
      .lean();

    const authorMap = new Map<string, PostAuthor>(
      authors.map((author) => [
        author._id.toString(),
        {
          id: author._id.toString(),
          fullName: author.fullName,
          avatarUrl: author.avatarUrl,
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
        },
      } as unknown as PostDocument;
    });
  }

  private async enrichPostWithAuthor(post: PostDocument): Promise<PostDocument> {
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
