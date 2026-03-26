import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WikiController } from './wiki.controller';
import {
  WikiArticle,
  WikiArticleSchema,
} from './schemas/wiki-article.schema';
import {
  WikiCategory,
  WikiCategorySchema,
} from './schemas/wiki-category.schema';
import {
  WikiArticleVote,
  WikiArticleVoteSchema,
} from './schemas/wiki-article-vote.schema';
import { WikiService } from './wiki.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WikiArticle.name, schema: WikiArticleSchema },
      { name: WikiCategory.name, schema: WikiCategorySchema },
      { name: WikiArticleVote.name, schema: WikiArticleVoteSchema },
    ]),
  ],
  controllers: [WikiController],
  providers: [WikiService],
  exports: [WikiService],
})
export class WikiModule {}

