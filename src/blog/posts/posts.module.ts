import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Category,
  CategorySchema,
} from '../categories/schemas/category.schema';
import { SubscriptionsModule } from '../../subscriptions/subscriptions.module';
import { GamificationModule } from '../../gamification/gamification.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { Tag, TagSchema } from '../tags/schemas/tag.schema';
import { User, UserSchema } from '../../users/schemas/user.schema';
import { WalletModule } from '../../wallet/wallet.module';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { PollVote, PollVoteSchema } from './schemas/poll-vote.schema';
import { Post, PostSchema } from './schemas/post.schema';

@Module({
  imports: [
    JwtModule,
    SubscriptionsModule,
    WalletModule,
    GamificationModule,
    NotificationsModule,
    MongooseModule.forFeature([
      { name: Post.name, schema: PostSchema },
      { name: PollVote.name, schema: PollVoteSchema },
      { name: Category.name, schema: CategorySchema },
      { name: Tag.name, schema: TagSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [PostsController],
  providers: [PostsService],
  exports: [PostsService, MongooseModule],
})
export class PostsModule {}
