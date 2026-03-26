import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/schemas/notification.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { LeaderboardQueryDto } from './dto/leaderboard-query.dto';
import { Badge, BadgeCriteriaType } from './schemas/badge.schema';
import {
  LeaderboardPeriod,
  LeaderboardSnapshot,
} from './schemas/leaderboard-snapshot.schema';
import { UserBadge } from './schemas/user-badge.schema';

type GamificationProgressInput = {
  xpDelta: number;
  postsPublishedDelta?: number;
  salesCountDelta?: number;
};

@Injectable()
export class GamificationService implements OnModuleInit {
  private readonly logger = new Logger(GamificationService.name);
  private readonly postApprovedXp = 50;
  private readonly orderCompletedXp = 100;

  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    @InjectModel(Badge.name)
    private readonly badgeModel: Model<Badge>,
    @InjectModel(UserBadge.name)
    private readonly userBadgeModel: Model<UserBadge>,
    @InjectModel(LeaderboardSnapshot.name)
    private readonly leaderboardSnapshotModel: Model<LeaderboardSnapshot>,
    @Optional()
    private readonly notificationsService?: NotificationsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaultBadges().catch((error) => {
      this.logger.warn(
        `Failed to seed default badges: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    });
  }

  async recordPostApproved(userId: string, postId: string): Promise<void> {
    const user = await this.applyProgress(userId, {
      xpDelta: this.postApprovedXp,
      postsPublishedDelta: 1,
    });
    if (!user) {
      return;
    }

    await this.evaluateBadges(user, {
      source: 'post_approved',
      postId,
    });
  }

  async recordOrderCompleted(
    sellerId: string,
    orderId: string,
    autoCompleted: boolean,
  ): Promise<void> {
    const user = await this.applyProgress(sellerId, {
      xpDelta: this.orderCompletedXp,
      salesCountDelta: 1,
    });
    if (!user) {
      return;
    }

    await this.evaluateBadges(user, {
      source: autoCompleted ? 'order_auto_completed' : 'order_completed',
      orderId,
      autoCompleted,
    });
  }

  async getBadges() {
    const badges = await this.badgeModel
      .find({ isActive: true })
      .sort({ 'criteria.threshold': 1, createdAt: 1 })
      .lean()
      .exec();

    return badges.map((badge) => ({
      id: badge._id.toString(),
      code: badge.code,
      name: badge.name,
      description: badge.description,
      iconUrl: badge.iconUrl,
      criteria: badge.criteria,
      xpReward: badge.xpReward ?? 0,
    }));
  }

  async getMyBadges(userId: string) {
    const userBadges = await this.userBadgeModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ awardedAt: -1 })
      .lean()
      .exec();

    const badgeIds = userBadges.map((item) => item.badgeId);
    const badges = await this.badgeModel
      .find({ _id: { $in: badgeIds } })
      .lean()
      .exec();
    const badgeMap = new Map(
      badges.map((badge) => [badge._id.toString(), badge]),
    );

    return userBadges.map((item) => {
      const badge = badgeMap.get(item.badgeId.toString());
      return {
        id: item._id.toString(),
        awardedAt: item.awardedAt,
        badge: badge
          ? {
              id: badge._id.toString(),
              code: badge.code,
              name: badge.name,
              description: badge.description,
              iconUrl: badge.iconUrl,
              criteria: badge.criteria,
              xpReward: badge.xpReward ?? 0,
            }
          : undefined,
      };
    });
  }

  async getLeaderboard(query: LeaderboardQueryDto) {
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      this.userModel
        .find({ isActive: { $ne: false } })
        .sort({
          'gamification.xp': -1,
          'gamification.level': -1,
          'gamification.salesCount': -1,
          followersCount: -1,
          createdAt: 1,
        })
        .skip(skip)
        .limit(query.limit)
        .select({
          fullName: 1,
          avatarUrl: 1,
          followersCount: 1,
          followingCount: 1,
          gamification: 1,
        })
        .lean()
        .exec(),
      this.userModel.countDocuments({ isActive: { $ne: false } }),
    ]);

    return new PaginatedResponseDto(
      items.map((user, index) => ({
        rank: skip + index + 1,
        userId: user._id.toString(),
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
        followersCount: user.followersCount ?? 0,
        followingCount: user.followingCount ?? 0,
        gamification: {
          xp: user.gamification?.xp ?? 0,
          level: user.gamification?.level ?? 1,
          xpToNextLevel: user.gamification?.xpToNextLevel ?? 100,
          postsPublished: user.gamification?.postsPublished ?? 0,
          salesCount: user.gamification?.salesCount ?? 0,
        },
      })),
      total,
      query.page,
      query.limit,
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async snapshotLeaderboards(): Promise<void> {
    const now = new Date();
    await this.createSnapshot(LeaderboardPeriod.ALLTIME, this.formatDate(now));

    if (now.getUTCDay() === 1) {
      await this.createSnapshot(
        LeaderboardPeriod.WEEKLY,
        this.formatWeekKey(now),
      );
    }

    if (now.getUTCDate() === 1) {
      await this.createSnapshot(
        LeaderboardPeriod.MONTHLY,
        this.formatMonthKey(now),
      );
    }
  }

  async seedDefaultBadges(): Promise<void> {
    const defaults: Array<{
      code: string;
      name: string;
      description: string;
      criteria: { type: BadgeCriteriaType; threshold: number };
      xpReward: number;
    }> = [
      {
        code: 'first-post',
        name: 'First Post',
        description: 'Publish your first approved post.',
        criteria: {
          type: BadgeCriteriaType.POSTS_PUBLISHED,
          threshold: 1,
        },
        xpReward: 25,
      },
      {
        code: 'content-writer-10',
        name: 'Content Writer',
        description: 'Reach 10 approved posts.',
        criteria: {
          type: BadgeCriteriaType.POSTS_PUBLISHED,
          threshold: 10,
        },
        xpReward: 100,
      },
      {
        code: 'first-sale',
        name: 'First Sale',
        description: 'Complete your first sale.',
        criteria: {
          type: BadgeCriteriaType.SALES_COUNT,
          threshold: 1,
        },
        xpReward: 30,
      },
      {
        code: 'seller-10',
        name: 'Trusted Seller',
        description: 'Complete 10 sales.',
        criteria: {
          type: BadgeCriteriaType.SALES_COUNT,
          threshold: 10,
        },
        xpReward: 120,
      },
      {
        code: 'level-5',
        name: 'Level 5',
        description: 'Reach level 5.',
        criteria: {
          type: BadgeCriteriaType.LEVEL_REACHED,
          threshold: 5,
        },
        xpReward: 80,
      },
    ];

    for (const badge of defaults) {
      await this.badgeModel
        .updateOne(
          { code: badge.code },
          {
            $setOnInsert: {
              code: badge.code,
              name: badge.name,
              description: badge.description,
              criteria: badge.criteria,
              xpReward: badge.xpReward,
              isActive: true,
            },
          },
          { upsert: true },
        )
        .exec();
    }
  }

  private async applyProgress(
    userId: string,
    input: GamificationProgressInput,
  ): Promise<UserDocument | null> {
    if (!Types.ObjectId.isValid(userId)) {
      return null;
    }

    const user = await this.userModel.findById(userId).exec();
    if (!user || user.isActive === false) {
      return null;
    }

    const currentXp = Math.max(0, user.gamification?.xp ?? 0);
    const nextXp = Math.max(0, currentXp + Math.max(0, input.xpDelta));
    const normalized = this.normalizeLevel(nextXp);

    user.gamification = {
      xp: nextXp,
      level: normalized.level,
      xpToNextLevel: normalized.xpToNextLevel,
      postsPublished: Math.max(
        0,
        (user.gamification?.postsPublished ?? 0) +
          (input.postsPublishedDelta ?? 0),
      ),
      salesCount: Math.max(
        0,
        (user.gamification?.salesCount ?? 0) + (input.salesCountDelta ?? 0),
      ),
    };

    await user.save();
    return user;
  }

  private normalizeLevel(xp: number): { level: number; xpToNextLevel: number } {
    let level = 1;
    let consumed = 0;
    let nextRequirement = this.getXpRequirementForLevel(level);

    while (xp >= consumed + nextRequirement) {
      consumed += nextRequirement;
      level += 1;
      nextRequirement = this.getXpRequirementForLevel(level);
    }

    return {
      level,
      xpToNextLevel: Math.max(1, consumed + nextRequirement - xp),
    };
  }

  private getXpRequirementForLevel(level: number): number {
    return Math.max(100, level * 100);
  }

  private async evaluateBadges(
    user: UserDocument,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const badges = await this.badgeModel
      .find({ isActive: true })
      .sort({ createdAt: 1 })
      .exec();
    if (!badges.length) {
      return;
    }

    const existing = await this.userBadgeModel
      .find({
        userId: user._id,
      })
      .select({ badgeCode: 1 })
      .lean()
      .exec();
    const awardedCodes = new Set(existing.map((item) => item.badgeCode));

    const now = new Date();
    const newBadges = badges.filter((badge) => {
      if (awardedCodes.has(badge.code)) {
        return false;
      }

      return this.userMeetsCriteria(
        user,
        badge.criteria.type,
        badge.criteria.threshold,
      );
    });

    if (!newBadges.length) {
      return;
    }

    await this.userBadgeModel.insertMany(
      newBadges.map((badge) => ({
        userId: user._id,
        badgeId: badge._id,
        badgeCode: badge.code,
        awardedAt: now,
        metadata,
      })),
    );

    const rewardXp = newBadges.reduce(
      (sum, badge) => sum + (badge.xpReward ?? 0),
      0,
    );
    if (rewardXp > 0) {
      const currentXp = Math.max(0, user.gamification?.xp ?? 0);
      const normalized = this.normalizeLevel(currentXp + rewardXp);
      user.gamification = {
        xp: currentXp + rewardXp,
        level: normalized.level,
        xpToNextLevel: normalized.xpToNextLevel,
        postsPublished: Math.max(0, user.gamification?.postsPublished ?? 0),
        salesCount: Math.max(0, user.gamification?.salesCount ?? 0),
      };
      await user.save();
    }

    if (this.notificationsService) {
      await Promise.all(
        newBadges.map((badge) =>
          this.notificationsService!.createGamificationNotification({
            userId: user.id,
            type: NotificationType.BADGE_EARNED,
            title: `Badge earned: ${badge.name}`,
            message: badge.description || `You earned badge "${badge.name}"`,
            metadata: {
              badgeCode: badge.code,
              badgeName: badge.name,
              xpReward: badge.xpReward ?? 0,
            },
          }).catch(() => undefined),
        ),
      );
    }
  }

  private userMeetsCriteria(
    user: UserDocument,
    type: BadgeCriteriaType,
    threshold: number,
  ): boolean {
    const gamification = user.gamification ?? {
      xp: 0,
      level: 1,
      xpToNextLevel: 100,
      postsPublished: 0,
      salesCount: 0,
    };

    if (type === BadgeCriteriaType.POSTS_PUBLISHED) {
      return (gamification.postsPublished ?? 0) >= threshold;
    }

    if (type === BadgeCriteriaType.SALES_COUNT) {
      return (gamification.salesCount ?? 0) >= threshold;
    }

    return (gamification.level ?? 1) >= threshold;
  }

  private async createSnapshot(
    period: LeaderboardPeriod,
    periodKey: string,
  ): Promise<void> {
    const topUsers = await this.userModel
      .find({ isActive: { $ne: false } })
      .sort({
        'gamification.xp': -1,
        'gamification.level': -1,
        'gamification.salesCount': -1,
        followersCount: -1,
      })
      .limit(100)
      .select({
        gamification: 1,
      })
      .lean()
      .exec();

    const entries = topUsers.map((user, index) => ({
      userId: user._id,
      rank: index + 1,
      xp: user.gamification?.xp ?? 0,
      level: user.gamification?.level ?? 1,
      postsPublished: user.gamification?.postsPublished ?? 0,
      salesCount: user.gamification?.salesCount ?? 0,
    }));

    await this.leaderboardSnapshotModel
      .updateOne(
        { period, periodKey },
        {
          $set: {
            entries,
            generatedAt: new Date(),
          },
        },
        { upsert: true },
      )
      .exec();
  }

  private formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private formatMonthKey(date: Date): string {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  private formatWeekKey(date: Date): string {
    const firstDay = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const dayOffset = Math.floor(
      (date.getTime() - firstDay.getTime()) / (24 * 60 * 60 * 1000),
    );
    const week = Math.floor((dayOffset + firstDay.getUTCDay()) / 7) + 1;
    return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }
}
