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
import { PaginationDto } from '../../common/dto/pagination.dto';
import { Post } from '../posts/schemas/post.schema';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { Comment, CommentDocument } from './schemas/comment.schema';

interface AuthUser {
  userId: string;
  role: Role;
}

@Injectable()
export class CommentsService {
  constructor(
    @InjectModel(Comment.name) private readonly commentModel: Model<Comment>,
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
  ) {}

  async listByPost(
    postId: string,
    query: PaginationDto,
  ): Promise<PaginatedResponseDto<CommentDocument>> {
    const skip = (query.page - 1) * query.limit;
    const filter = {
      postId: new Types.ObjectId(postId),
      isDeleted: false,
      isHidden: false,
    };

    const [data, total] = await Promise.all([
      this.commentModel
        .find(filter)
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(query.limit)
        .lean(),
      this.commentModel.countDocuments(filter),
    ]);

    return new PaginatedResponseDto(
      data as CommentDocument[],
      total,
      query.page,
      query.limit,
    );
  }

  async create(
    postId: string,
    userId: string,
    payload: CreateCommentDto,
  ): Promise<CommentDocument> {
    const postExists = await this.postModel.exists({ _id: postId });
    if (!postExists) {
      throw new NotFoundException('Post not found');
    }

    let depth = 1;
    let parentObjectId: Types.ObjectId | undefined;

    if (payload.parentId) {
      const parent = await this.commentModel.findById(payload.parentId).exec();
      if (!parent || parent.postId.toString() !== postId) {
        throw new BadRequestException('Invalid parent comment');
      }

      if (parent.depth >= 3) {
        throw new BadRequestException('Maximum comment nesting depth is 3');
      }

      parentObjectId = new Types.ObjectId(payload.parentId);
      depth = parent.depth + 1;
    }

    const comment = await this.commentModel.create({
      postId: new Types.ObjectId(postId),
      authorId: new Types.ObjectId(userId),
      content: payload.content,
      parentId: parentObjectId,
      depth,
    });

    await this.postModel.updateOne(
      { _id: postId },
      { $inc: { commentsCount: 1 } },
    );

    return comment;
  }

  async update(
    commentId: string,
    userId: string,
    payload: UpdateCommentDto,
  ): Promise<CommentDocument> {
    const comment = await this.commentModel.findById(commentId).exec();
    if (!comment || comment.isDeleted) {
      throw new NotFoundException('Comment not found');
    }

    if (comment.authorId.toString() !== userId) {
      throw new ForbiddenException('You can only edit your own comment');
    }

    comment.content = payload.content;
    comment.isEdited = true;
    await comment.save();

    return comment;
  }

  async remove(
    commentId: string,
    userId: string,
  ): Promise<{ message: string }> {
    const comment = await this.commentModel.findById(commentId).exec();
    if (!comment || comment.isDeleted) {
      throw new NotFoundException('Comment not found');
    }

    if (comment.authorId.toString() !== userId) {
      throw new ForbiddenException('You can only delete your own comment');
    }

    comment.isDeleted = true;
    comment.content = '[deleted]';
    await comment.save();

    await this.postModel.updateOne(
      { _id: comment.postId },
      { $inc: { commentsCount: -1 } },
    );

    return { message: 'Comment deleted successfully' };
  }

  async toggleLike(commentId: string, userId: string) {
    const comment = await this.commentModel.findById(commentId).exec();
    if (!comment || comment.isDeleted) {
      throw new NotFoundException('Comment not found');
    }

    const userObjectId = new Types.ObjectId(userId);
    const alreadyLiked = comment.likes.some(
      (item) => item.toString() === userId,
    );

    if (alreadyLiked) {
      await this.commentModel.updateOne(
        { _id: comment._id },
        {
          $pull: { likes: userObjectId },
          $inc: { likesCount: -1 },
        },
      );

      return { liked: false };
    }

    await this.commentModel.updateOne(
      { _id: comment._id },
      {
        $addToSet: { likes: userObjectId },
        $inc: { likesCount: 1 },
      },
    );

    return { liked: true };
  }

  async hide(
    commentId: string,
    user: AuthUser,
    reason?: string,
  ): Promise<CommentDocument> {
    if (![Role.STAFF, Role.ADMIN].includes(user.role)) {
      throw new ForbiddenException('Only staff/admin can hide comments');
    }

    const comment = await this.commentModel.findById(commentId).exec();
    if (!comment || comment.isDeleted) {
      throw new NotFoundException('Comment not found');
    }

    comment.isHidden = true;
    comment.hiddenBy = new Types.ObjectId(user.userId);
    comment.hideReason = reason;

    await comment.save();
    return comment;
  }
}
