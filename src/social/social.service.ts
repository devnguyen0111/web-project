import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import { MongoTransactionService } from '../common/services/mongo-transaction.service';
import { User } from '../users/schemas/user.schema';
import { FollowQueryDto } from './dto/follow-query.dto';
import { UserFollow } from './schemas/user-follow.schema';

@Injectable()
export class SocialService {
  constructor(
    @InjectModel(UserFollow.name)
    private readonly userFollowModel: Model<UserFollow>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    @InjectConnection()
    private readonly connection: Connection,
    private readonly mongoTransactionService: MongoTransactionService,
  ) {}

  async follow(userId: string, targetUserId: string) {
    this.ensureValidUserPair(userId, targetUserId);
    await this.ensureUserExists(targetUserId);

    return this.executeInTransaction(async (session) => {
      const filter = {
        followerId: new Types.ObjectId(userId),
        followingId: new Types.ObjectId(targetUserId),
      };
      const existing = await this.userFollowModel
        .findOne(filter)
        .session(session)
        .exec();
      if (existing) {
        return {
          following: true,
          created: false,
        };
      }

      await this.userFollowModel.create(
        [
          {
            followerId: new Types.ObjectId(userId),
            followingId: new Types.ObjectId(targetUserId),
          },
        ],
        { session },
      );

      await Promise.all([
        this.userModel.updateOne(
          { _id: new Types.ObjectId(userId) },
          { $inc: { followingCount: 1 } },
          { session },
        ),
        this.userModel.updateOne(
          { _id: new Types.ObjectId(targetUserId) },
          { $inc: { followersCount: 1 } },
          { session },
        ),
      ]);

      return {
        following: true,
        created: true,
      };
    });
  }

  async unfollow(userId: string, targetUserId: string) {
    this.ensureValidUserPair(userId, targetUserId);

    return this.executeInTransaction(async (session) => {
      const filter = {
        followerId: new Types.ObjectId(userId),
        followingId: new Types.ObjectId(targetUserId),
      };
      const existing = await this.userFollowModel
        .findOne(filter)
        .session(session)
        .exec();
      if (!existing) {
        return {
          following: false,
          removed: false,
        };
      }

      await this.userFollowModel
        .deleteOne({ _id: existing._id })
        .session(session);
      await Promise.all([
        this.userModel.updateOne(
          { _id: new Types.ObjectId(userId) },
          { $inc: { followingCount: -1 } },
          { session },
        ),
        this.userModel.updateOne(
          { _id: new Types.ObjectId(targetUserId) },
          { $inc: { followersCount: -1 } },
          { session },
        ),
      ]);

      await Promise.all([
        this.userModel.updateOne(
          { _id: new Types.ObjectId(userId), followingCount: { $lt: 0 } },
          { $set: { followingCount: 0 } },
          { session },
        ),
        this.userModel.updateOne(
          { _id: new Types.ObjectId(targetUserId), followersCount: { $lt: 0 } },
          { $set: { followersCount: 0 } },
          { session },
        ),
      ]);

      return {
        following: false,
        removed: true,
      };
    });
  }

  async listFollowers(userId: string, query: FollowQueryDto) {
    await this.ensureUserExists(userId);
    const skip = (query.page - 1) * query.limit;

    const [items, total] = await Promise.all([
      this.userFollowModel
        .find({ followingId: new Types.ObjectId(userId) })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(query.limit)
        .lean()
        .exec(),
      this.userFollowModel.countDocuments({
        followingId: new Types.ObjectId(userId),
      }),
    ]);

    const users = await this.userModel
      .find({
        _id: { $in: items.map((item) => item.followerId) },
      })
      .select({
        fullName: 1,
        avatarUrl: 1,
        followersCount: 1,
        followingCount: 1,
        gamification: 1,
      })
      .lean()
      .exec();
    const userMap = new Map(users.map((user) => [user._id.toString(), user]));

    return new PaginatedResponseDto(
      items.map((item) => {
        const user = userMap.get(item.followerId.toString());
        return {
          userId: item.followerId.toString(),
          followedAt: item.createdAt,
          fullName: user?.fullName,
          avatarUrl: user?.avatarUrl,
          followersCount: user?.followersCount ?? 0,
          followingCount: user?.followingCount ?? 0,
          gamification: user?.gamification ?? {
            xp: 0,
            level: 1,
            xpToNextLevel: 100,
            postsPublished: 0,
            salesCount: 0,
          },
        };
      }),
      total,
      query.page,
      query.limit,
    );
  }

  async listFollowing(userId: string, query: FollowQueryDto) {
    await this.ensureUserExists(userId);
    const skip = (query.page - 1) * query.limit;

    const [items, total] = await Promise.all([
      this.userFollowModel
        .find({ followerId: new Types.ObjectId(userId) })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(query.limit)
        .lean()
        .exec(),
      this.userFollowModel.countDocuments({
        followerId: new Types.ObjectId(userId),
      }),
    ]);

    const users = await this.userModel
      .find({
        _id: { $in: items.map((item) => item.followingId) },
      })
      .select({
        fullName: 1,
        avatarUrl: 1,
        followersCount: 1,
        followingCount: 1,
        gamification: 1,
      })
      .lean()
      .exec();
    const userMap = new Map(users.map((user) => [user._id.toString(), user]));

    return new PaginatedResponseDto(
      items.map((item) => {
        const user = userMap.get(item.followingId.toString());
        return {
          userId: item.followingId.toString(),
          followedAt: item.createdAt,
          fullName: user?.fullName,
          avatarUrl: user?.avatarUrl,
          followersCount: user?.followersCount ?? 0,
          followingCount: user?.followingCount ?? 0,
          gamification: user?.gamification ?? {
            xp: 0,
            level: 1,
            xpToNextLevel: 100,
            postsPublished: 0,
            salesCount: 0,
          },
        };
      }),
      total,
      query.page,
      query.limit,
    );
  }

  private ensureValidUserPair(userId: string, targetUserId: string): void {
    if (
      !Types.ObjectId.isValid(userId) ||
      !Types.ObjectId.isValid(targetUserId)
    ) {
      throw new BadRequestException('Invalid user id');
    }

    if (userId === targetUserId) {
      throw new BadRequestException('You cannot follow yourself');
    }
  }

  private async ensureUserExists(userId: string): Promise<void> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('User not found');
    }

    const exists = await this.userModel.exists({
      _id: new Types.ObjectId(userId),
    });
    if (!exists) {
      throw new NotFoundException('User not found');
    }
  }

  private executeInTransaction<T>(
    callback: (session: ClientSession) => Promise<T>,
    session?: ClientSession,
  ): Promise<T> {
    return this.mongoTransactionService.executeInTransaction(
      this.connection,
      callback,
      session,
    );
  }
}
