import { Module } from '@nestjs/common';
import { CategoriesModule } from './categories/categories.module';
import { CommentsModule } from './comments/comments.module';
import { ModerationModule } from './moderation/moderation.module';
import { PostsModule } from './posts/posts.module';
import { TagsModule } from './tags/tags.module';

@Module({
  imports: [
    CategoriesModule,
    TagsModule,
    PostsModule,
    CommentsModule,
    ModerationModule,
  ],
})
export class BlogModule {}
