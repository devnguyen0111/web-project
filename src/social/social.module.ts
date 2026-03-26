import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MongoTransactionService } from '../common/services/mongo-transaction.service';
import { GamificationModule } from '../gamification/gamification.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { SocialController } from './social.controller';
import { UserFollow, UserFollowSchema } from './schemas/user-follow.schema';
import { SocialService } from './social.service';

@Module({
  imports: [
    GamificationModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: UserFollow.name, schema: UserFollowSchema },
    ]),
  ],
  controllers: [SocialController],
  providers: [SocialService, MongoTransactionService],
  exports: [SocialService],
})
export class SocialModule {}
