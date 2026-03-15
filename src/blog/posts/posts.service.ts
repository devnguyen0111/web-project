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
import { Category } from '../categories/schemas/category.schema';
import { Tag } from '../tags/schemas/tag.schema';
import { CreatePostDto } from './dto/create-post.dto';
import { PostsQueryDto } from './dto/posts-query.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { Post, PostDocument, PostStatus } from './schemas/post.schema';
import { PollVote } from './schemas/poll-vote.schema';

interface AuthUser {
  userId: string;
  role: Role;
}

@Injectable()
export class PostsService {
  constructor(
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    @InjectModel(PollVote.name) private readonly pollVoteModel: Model<PollVote>,
    @InjectModel(Category.name) private readonly categoryModel: Model<Category>,
    @InjectModel(Tag.name) private readonly tagModel: Model<Tag>,
  ) {}

  async createDraft(
    userId: string,
    payload: CreatePostDto,
  ): Promise<PostDocument> {
    await this.validateReferences(payload.categoryId, payload.tagIds);

    const slug = await this.ensureUniqueSlug(payload.title);
    const post = await this.postModel.create({
      authorId: new Types.ObjectId(userId),
      title: payload.title,
      slug,
      excerpt: payload.excerpt,
      content: payload.content,
      categoryId: payload.categoryId
        ? new Types.ObjectId(payload.categoryId)
        : undefined,
      tags: (payload.tagIds ?? []).map((tagId) => new Types.ObjectId(tagId)),
      status: PostStatus.DRAFT,
      poll: payload.poll
        ? {
            question: payload.poll.question,
            options: payload.poll.options.map((option) => ({
              text: option.text,
              votes: 0,
            })),
            totalVotes: 0,
          }
        : undefined,
    });

    await this.tagModel.updateMany(
      { _id: { $in: payload.tagIds ?? [] } },
      { $inc: { usageCount: 1 } },
    );

    return post;
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

    if (post.status === PostStatus.PUBLISHED && !this.isModerator(user.role)) {
      throw new BadRequestException(
        'Published posts can only be edited by staff/admin',
      );
    }

    await this.validateReferences(payload.categoryId, payload.tagIds);

    if (payload.title && payload.title !== post.title) {
      post.slug = await this.ensureUniqueSlug(payload.title, post.id);
      post.title = payload.title;
    }

    if (payload.excerpt !== undefined) {
      post.excerpt = payload.excerpt;
    }

    if (payload.content !== undefined) {
      post.content = payload.content;
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
      post.poll = payload.poll
        ? {
            question: payload.poll.question,
            options: payload.poll.options.map((option) => ({
              text: option.text,
              votes: 0,
            })),
            totalVotes: 0,
          }
        : undefined;
      await this.pollVoteModel.deleteMany({ postId: post._id });
    }

    if (post.status === PostStatus.REJECTED) {
      post.status = PostStatus.DRAFT;
      post.rejectionReason = undefined;
    }

    await post.save();
    return post;
  }

  async deletePost(postId: string, user: AuthUser) {
    const post = await this.postModel.findById(postId).exec();
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    this.ensureOwnership(post, user);

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
    post.rejectionReason = undefined;

    await post.save();
    return post;
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

    return new PaginatedResponseDto(
      data as PostDocument[],
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

    return new PaginatedResponseDto(
      data as PostDocument[],
      total,
      query.page,
      query.limit,
    );
  }

  async findPublishedBySlug(slug: string): Promise<PostDocument> {
    const post = await this.postModel
      .findOne({ slug, status: PostStatus.PUBLISHED })
      .exec();
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    await this.postModel.updateOne({ _id: post._id }, { $inc: { views: 1 } });
    post.views += 1;

    return post;
  }

  async toggleLike(postId: string, userId: string) {
    const post = await this.postModel.findById(postId).exec();
    if (!post) {
      throw new NotFoundException('Post not found');
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
      return { liked: false };
    }

    await this.postModel.updateOne(
      { _id: post._id },
      {
        $addToSet: { likes: userObjectId },
        $inc: { likesCount: 1 },
      },
    );

    return { liked: true };
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

    return new PaginatedResponseDto(
      data as PostDocument[],
      total,
      query.page,
      query.limit,
    );
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
    return post;
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
