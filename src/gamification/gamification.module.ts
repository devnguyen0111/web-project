import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsModule } from '../notifications/notifications.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { BadgesController } from './badges.controller';
import { GamificationService } from './gamification.service';
import { Badge, BadgeSchema } from './schemas/badge.schema';
import {
  LeaderboardSnapshot,
  LeaderboardSnapshotSchema,
} from './schemas/leaderboard-snapshot.schema';
import { UserBadge, UserBadgeSchema } from './schemas/user-badge.schema';

@Module({
  imports: [
    NotificationsModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Badge.name, schema: BadgeSchema },
      { name: UserBadge.name, schema: UserBadgeSchema },
      { name: LeaderboardSnapshot.name, schema: LeaderboardSnapshotSchema },
    ]),
  ],
  controllers: [BadgesController],
  providers: [GamificationService],
  exports: [GamificationService],
})
export class GamificationModule {}
