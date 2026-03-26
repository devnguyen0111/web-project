import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import { toSlug } from '../common/utils/slug.util';
import { CreateWikiArticleDto } from './dto/create-wiki-article.dto';
import { UpdateWikiArticleDto } from './dto/update-wiki-article.dto';
import { WikiHelpfulVoteDto } from './dto/wiki-helpful-vote.dto';
import { WikiQueryDto } from './dto/wiki-query.dto';
import {
  WikiArticle,
  WikiArticleDocument,
  WikiArticleStatus,
} from './schemas/wiki-article.schema';
import { WikiCategory } from './schemas/wiki-category.schema';
import {
  WikiArticleVote,
  WikiHelpfulVote,
} from './schemas/wiki-article-vote.schema';

@Injectable()
export class WikiService {
  constructor(
    @InjectModel(WikiArticle.name)
    private readonly wikiArticleModel: Model<WikiArticle>,
    @InjectModel(WikiCategory.name)
    private readonly wikiCategoryModel: Model<WikiCategory>,
    @InjectModel(WikiArticleVote.name)
    private readonly wikiArticleVoteModel: Model<WikiArticleVote>,
  ) {}

  async listPublic(query: WikiQueryDto) {
    const filter: Record<string, unknown> = {
      status: WikiArticleStatus.PUBLISHED,
      isPublic: true,
    };

    if (query.categoryId) {
      filter.categoryId = new Types.ObjectId(query.categoryId);
    }

    const keyword = query.q?.trim();
    if (keyword) {
      const safeRegex = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { title: { $regex: safeRegex, $options: 'i' } },
        { excerpt: { $regex: safeRegex, $options: 'i' } },
        { content: { $regex: safeRegex, $options: 'i' } },
      ];
    }

    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      this.wikiArticleModel
        .find(filter)
        .sort({ order: 1, updatedAt: -1 })
        .skip(skip)
        .limit(query.limit)
        .exec(),
      this.wikiArticleModel.countDocuments(filter),
    ]);

    return new PaginatedResponseDto(items, total, query.page, query.limit);
  }

  async getPublicBySlug(slug: string) {
    const article = await this.wikiArticleModel
      .findOneAndUpdate(
        {
          slug: toSlug(slug),
          status: WikiArticleStatus.PUBLISHED,
          isPublic: true,
        },
        { $inc: { views: 1 } },
        { returnDocument: 'after' },
      )
      .exec();

    if (!article) {
      throw new NotFoundException('Wiki article not found');
    }

    return article;
  }

  async createArticle(actorUserId: string, payload: CreateWikiArticleDto) {
    const article = await this.wikiArticleModel.create({
      title: payload.title.trim(),
      slug: toSlug(payload.slug),
      content: payload.content,
      excerpt: payload.excerpt?.trim(),
      categoryId: this.toObjectIdOrUndefined(payload.categoryId),
      tags: this.normalizeTags(payload.tags),
      parentArticleId: this.toObjectIdOrUndefined(payload.parentArticleId),
      order: payload.order ?? 0,
      breadcrumb: this.normalizeBreadcrumb(payload.breadcrumb),
      version: 1,
      lastEditedBy: new Types.ObjectId(actorUserId),
      changelog: [
        {
          version: 1,
          editedBy: new Types.ObjectId(actorUserId),
          editedAt: new Date(),
          summary: payload.summary?.trim() || 'Initial version',
        },
      ],
      status: payload.status ?? WikiArticleStatus.DRAFT,
      isPublic: payload.isPublic ?? true,
      requiredTier: payload.requiredTier,
      publishedAt:
        payload.status === WikiArticleStatus.PUBLISHED ? new Date() : undefined,
    });

    await this.syncCategoryCounts([
      article.categoryId ? article.categoryId.toString() : undefined,
    ]);

    return article;
  }

  async updateArticle(
    articleId: string,
    actorUserId: string,
    payload: UpdateWikiArticleDto,
  ) {
    const article = await this.wikiArticleModel.findById(articleId).exec();
    if (!article) {
      throw new NotFoundException('Wiki article not found');
    }

    const previousCategoryId = article.categoryId?.toString();
    const snapshot = this.buildSnapshot(article);

    if (payload.title !== undefined) {
      article.title = payload.title.trim();
    }
    if (payload.slug !== undefined) {
      article.slug = toSlug(payload.slug);
    }
    if (payload.content !== undefined) {
      article.content = payload.content;
    }
    if (payload.excerpt !== undefined) {
      article.excerpt = payload.excerpt?.trim();
    }
    if (payload.categoryId !== undefined) {
      article.categoryId = this.toObjectIdOrUndefined(payload.categoryId);
    }
    if (payload.tags !== undefined) {
      article.tags = this.normalizeTags(payload.tags);
    }
    if (payload.parentArticleId !== undefined) {
      article.parentArticleId = this.toObjectIdOrUndefined(payload.parentArticleId);
    }
    if (payload.order !== undefined) {
      article.order = payload.order;
    }
    if (payload.breadcrumb !== undefined) {
      article.breadcrumb = this.normalizeBreadcrumb(payload.breadcrumb) as never;
    }
    if (payload.status !== undefined) {
      article.status = payload.status;
      if (payload.status === WikiArticleStatus.PUBLISHED && !article.publishedAt) {
        article.publishedAt = new Date();
      }
    }
    if (payload.isPublic !== undefined) {
      article.isPublic = payload.isPublic;
    }
    if (payload.requiredTier !== undefined) {
      article.requiredTier = payload.requiredTier;
    }

    const nextVersion = (article.version ?? 1) + 1;
    article.version = nextVersion;
    article.lastEditedBy = new Types.ObjectId(actorUserId);
    article.changelog = Array.isArray(article.changelog)
      ? article.changelog
      : [];
    article.changelog.push({
      version: nextVersion,
      editedBy: new Types.ObjectId(actorUserId),
      editedAt: new Date(),
      summary: payload.summary?.trim() || 'Content updated',
      snapshot,
    } as never);

    await article.save();

    await this.syncCategoryCounts([
      previousCategoryId,
      article.categoryId?.toString(),
    ]);

    return article;
  }

  async archiveArticle(articleId: string, actorUserId: string) {
    const article = await this.wikiArticleModel.findById(articleId).exec();
    if (!article) {
      throw new NotFoundException('Wiki article not found');
    }

    const previousCategoryId = article.categoryId?.toString();
    if (article.status === WikiArticleStatus.ARCHIVED) {
      return article;
    }

    const nextVersion = (article.version ?? 1) + 1;
    article.version = nextVersion;
    article.lastEditedBy = new Types.ObjectId(actorUserId);
    article.status = WikiArticleStatus.ARCHIVED;
    article.isPublic = false;
    article.changelog = Array.isArray(article.changelog)
      ? article.changelog
      : [];
    article.changelog.push({
      version: nextVersion,
      editedBy: new Types.ObjectId(actorUserId),
      editedAt: new Date(),
      summary: 'Article archived',
      snapshot: this.buildSnapshot(article),
    } as never);

    await article.save();
    await this.syncCategoryCounts([previousCategoryId]);

    return article;
  }

  async voteHelpful(
    articleId: string,
    userId: string,
    payload: WikiHelpfulVoteDto,
  ) {
    const article = await this.wikiArticleModel.findById(articleId).exec();
    if (!article) {
      throw new NotFoundException('Wiki article not found');
    }

    if (
      article.status !== WikiArticleStatus.PUBLISHED ||
      article.isPublic !== true
    ) {
      throw new BadRequestException(
        'Helpful vote is only available for published public articles',
      );
    }

    const existing = await this.wikiArticleVoteModel
      .findOne({
        articleId: new Types.ObjectId(articleId),
        userId: new Types.ObjectId(userId),
      })
      .exec();

    if (!existing) {
      await this.wikiArticleVoteModel.create({
        articleId: new Types.ObjectId(articleId),
        userId: new Types.ObjectId(userId),
        value: payload.value,
      });

      if (payload.value === WikiHelpfulVote.YES) {
        article.helpfulYes = (article.helpfulYes ?? 0) + 1;
      } else {
        article.helpfulNo = (article.helpfulNo ?? 0) + 1;
      }
      await article.save();
    } else if (existing.value !== payload.value) {
      if (existing.value === WikiHelpfulVote.YES) {
        article.helpfulYes = Math.max(0, (article.helpfulYes ?? 0) - 1);
      } else {
        article.helpfulNo = Math.max(0, (article.helpfulNo ?? 0) - 1);
      }

      if (payload.value === WikiHelpfulVote.YES) {
        article.helpfulYes = (article.helpfulYes ?? 0) + 1;
      } else {
        article.helpfulNo = (article.helpfulNo ?? 0) + 1;
      }

      existing.value = payload.value;
      await Promise.all([existing.save(), article.save()]);
    }

    return {
      articleId: article.id,
      helpfulYes: article.helpfulYes ?? 0,
      helpfulNo: article.helpfulNo ?? 0,
      value: payload.value,
    };
  }

  async listCategories() {
    return this.wikiCategoryModel
      .find({ isActive: true })
      .sort({ order: 1, name: 1 })
      .exec();
  }

  private buildSnapshot(article: WikiArticleDocument) {
    return {
      title: article.title,
      excerpt: article.excerpt,
      content: article.content,
      tags: Array.isArray(article.tags) ? article.tags : [],
      categoryId: article.categoryId,
      parentArticleId: article.parentArticleId,
      order: article.order ?? 0,
      breadcrumb: Array.isArray(article.breadcrumb) ? article.breadcrumb : [],
      status: article.status,
      isPublic: article.isPublic === true,
      requiredTier: article.requiredTier,
    };
  }

  private normalizeTags(tags?: string[]) {
    if (!Array.isArray(tags) || tags.length === 0) {
      return [];
    }

    const deduped = new Set<string>();
    for (const tag of tags) {
      const normalized = tag?.trim().toLowerCase();
      if (!normalized) {
        continue;
      }
      deduped.add(normalized.slice(0, 80));
      if (deduped.size >= 20) {
        break;
      }
    }

    return [...deduped];
  }

  private normalizeBreadcrumb(
    breadcrumb:
      | Array<{ articleId: string; title: string; slug: string }>
      | undefined,
  ) {
    if (!Array.isArray(breadcrumb) || breadcrumb.length === 0) {
      return [];
    }

    return breadcrumb
      .filter((item) => Types.ObjectId.isValid(item.articleId))
      .map((item) => ({
        articleId: new Types.ObjectId(item.articleId),
        title: item.title.trim(),
        slug: toSlug(item.slug),
      }))
      .slice(0, 30);
  }

  private toObjectIdOrUndefined(value?: string): Types.ObjectId | undefined {
    if (!value) {
      return undefined;
    }

    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException('Invalid object id');
    }

    return new Types.ObjectId(value);
  }

  private async syncCategoryCounts(
    categoryIds: Array<string | undefined>,
  ): Promise<void> {
    const uniqueCategoryIds = [
      ...new Set(categoryIds.filter((value): value is string => !!value)),
    ];
    if (!uniqueCategoryIds.length) {
      return;
    }

    await Promise.all(
      uniqueCategoryIds.map(async (categoryId) => {
        const total = await this.wikiArticleModel.countDocuments({
          categoryId: new Types.ObjectId(categoryId),
          status: { $ne: WikiArticleStatus.ARCHIVED },
        });
        await this.wikiCategoryModel.updateOne(
          { _id: new Types.ObjectId(categoryId) },
          { $set: { articleCount: total } },
        );
      }),
    );
  }
}

