import { Types } from 'mongoose';
import { WikiService } from './wiki.service';
import { WikiArticleStatus } from './schemas/wiki-article.schema';
import { WikiHelpfulVote } from './schemas/wiki-article-vote.schema';

const buildQuery = <T>(result: T) => ({
  exec: jest.fn().mockResolvedValue(result),
});

describe('WikiService', () => {
  let service: WikiService;
  let wikiArticleModel: {
    findById: jest.Mock;
    countDocuments: jest.Mock;
  };
  let wikiCategoryModel: {
    updateOne: jest.Mock;
  };
  let wikiArticleVoteModel: {
    findOne: jest.Mock;
    create: jest.Mock;
  };

  beforeEach(() => {
    wikiArticleModel = {
      findById: jest.fn(),
      countDocuments: jest.fn().mockResolvedValue(1),
    };
    wikiCategoryModel = {
      updateOne: jest.fn().mockResolvedValue(undefined),
    };
    wikiArticleVoteModel = {
      findOne: jest.fn(),
      create: jest.fn().mockResolvedValue(undefined),
    };

    service = new WikiService(
      wikiArticleModel as never,
      wikiCategoryModel as never,
      wikiArticleVoteModel as never,
    );
  });

  it('increments version and stores changelog snapshot when updating article', async () => {
    const actorUserId = new Types.ObjectId().toString();
    const articleId = new Types.ObjectId().toString();
    const categoryId = new Types.ObjectId();
    const article = {
      id: articleId,
      title: 'Old title',
      slug: 'old-title',
      content: 'old content',
      excerpt: 'old excerpt',
      categoryId,
      tags: ['old'],
      parentArticleId: undefined,
      order: 1,
      breadcrumb: [],
      status: WikiArticleStatus.DRAFT,
      isPublic: true,
      requiredTier: undefined,
      version: 2,
      changelog: [],
      save: jest.fn().mockResolvedValue(undefined),
    };

    wikiArticleModel.findById.mockReturnValue(buildQuery(article));

    const result = await service.updateArticle(articleId, actorUserId, {
      title: 'New title',
      content: 'new content',
      summary: 'edit content',
    });

    expect(result.version).toBe(3);
    expect(result.title).toBe('New title');
    expect(result.content).toBe('new content');
    expect(result.changelog).toHaveLength(1);
    expect(result.changelog[0]).toEqual(
      expect.objectContaining({
        version: 3,
        summary: 'edit content',
        snapshot: expect.objectContaining({
          title: 'Old title',
          content: 'old content',
          status: WikiArticleStatus.DRAFT,
          isPublic: true,
        }),
      }),
    );
    expect(article.save).toHaveBeenCalled();
  });

  it('keeps helpful vote idempotent for same value and applies delta when value changes', async () => {
    const articleId = new Types.ObjectId().toString();
    const userId = new Types.ObjectId().toString();
    const article = {
      id: articleId,
      status: WikiArticleStatus.PUBLISHED,
      isPublic: true,
      helpfulYes: 0,
      helpfulNo: 0,
      save: jest.fn().mockResolvedValue(undefined),
    };

    wikiArticleModel.findById.mockReturnValue(buildQuery(article));

    wikiArticleVoteModel.findOne
      .mockReturnValueOnce(buildQuery(null))
      .mockReturnValueOnce(
        buildQuery({
          value: WikiHelpfulVote.YES,
          save: jest.fn().mockResolvedValue(undefined),
        }),
      )
      .mockReturnValueOnce(
        buildQuery({
          value: WikiHelpfulVote.YES,
          save: jest.fn().mockResolvedValue(undefined),
        }),
      );

    const first = await service.voteHelpful(articleId, userId, {
      value: WikiHelpfulVote.YES,
    });
    const second = await service.voteHelpful(articleId, userId, {
      value: WikiHelpfulVote.YES,
    });
    const third = await service.voteHelpful(articleId, userId, {
      value: WikiHelpfulVote.NO,
    });

    expect(first).toEqual(
      expect.objectContaining({ helpfulYes: 1, helpfulNo: 0, value: 'yes' }),
    );
    expect(second).toEqual(
      expect.objectContaining({ helpfulYes: 1, helpfulNo: 0, value: 'yes' }),
    );
    expect(third).toEqual(
      expect.objectContaining({ helpfulYes: 0, helpfulNo: 1, value: 'no' }),
    );

    expect(wikiArticleVoteModel.create).toHaveBeenCalledTimes(1);
  });
});

