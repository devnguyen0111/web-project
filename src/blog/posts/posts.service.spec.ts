import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { MinioService } from '../../minio/minio.service';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { User } from '../../users/schemas/user.schema';
import { WalletService } from '../../wallet/wallet.service';
import { Category } from '../categories/schemas/category.schema';
import { Tag } from '../tags/schemas/tag.schema';
import { PostsService } from './posts.service';
import { PollVote } from './schemas/poll-vote.schema';
import { Post } from './schemas/post.schema';

describe('PostsService', () => {
  let service: PostsService;
  let postModel: {
    create: jest.Mock;
    findOne: jest.Mock;
    countDocuments: jest.Mock;
  };
  let pollVoteModel: Record<string, jest.Mock>;
  let categoryModel: {
    exists: jest.Mock;
  };
  let tagModel: {
    countDocuments: jest.Mock;
    updateMany: jest.Mock;
  };
  let userModel: {
    find: jest.Mock;
  };
  let subscriptionsService: {
    consumePostQuota: jest.Mock;
  };
  let connection: {
    startSession: jest.Mock;
    db?: {
      admin: jest.Mock;
    };
  };

  beforeEach(() => {
    postModel = {
      create: jest.fn(),
      findOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      }),
      countDocuments: jest.fn(),
    };
    pollVoteModel = {};
    categoryModel = {
      exists: jest.fn().mockResolvedValue(true),
    };
    tagModel = {
      countDocuments: jest.fn().mockResolvedValue(1),
      updateMany: jest.fn().mockResolvedValue(undefined),
    };
    userModel = {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      }),
    };
    subscriptionsService = {
      consumePostQuota: jest.fn().mockResolvedValue(undefined),
    };
    connection = {
      startSession: jest.fn(),
    };

    service = new PostsService(
      connection as never,
      postModel as unknown as Model<Post>,
      pollVoteModel as unknown as Model<PollVote>,
      categoryModel as unknown as Model<Category>,
      tagModel as unknown as Model<Tag>,
      userModel as unknown as Model<User>,
      subscriptionsService as unknown as SubscriptionsService,
      {} as WalletService,
      {
        get: jest.fn().mockReturnValue(25),
      } as unknown as ConfigService,
      {} as MinioService,
    );
  });

  it('blocks draft creation when subscription quota is exhausted', async () => {
    const startedSession = {
      withTransaction: jest.fn(),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    connection.startSession.mockResolvedValue(startedSession);
    connection.db = {
      admin: jest.fn().mockReturnValue({
        command: jest.fn().mockResolvedValue({ setName: 'rs0' }),
      }),
    };
    startedSession.withTransaction.mockImplementation(
      async (callback: () => Promise<void>) => {
        await callback();
      },
    );
    subscriptionsService.consumePostQuota.mockRejectedValue(
      new BadRequestException('Monthly post quota exceeded.'),
    );

    await expect(
      service.createDraft('67d9b7e23e1fd4f307ea1f01', {
        title: 'Quota test',
        excerpt: 'Testing quota',
        blocks: [{ type: 'paragraph', text: 'Body' }],
        tagIds: ['67d9b7e23e1fd4f307ea1f02'],
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(subscriptionsService.consumePostQuota).toHaveBeenCalledTimes(1);
    expect(postModel.create).not.toHaveBeenCalled();
    expect(tagModel.updateMany).not.toHaveBeenCalled();
  });

  it('returns moderation stats summary', async () => {
    postModel.countDocuments
      .mockResolvedValueOnce(5) // pending
      .mockResolvedValueOnce(9) // published
      .mockResolvedValueOnce(2) // rejected
      .mockResolvedValueOnce(4) // draft
      .mockResolvedValueOnce(7) // reviewedLast7Days
      .mockResolvedValueOnce(6) // approvedLast7Days
      .mockResolvedValueOnce(1); // rejectedLast7Days

    const result = await service.getModerationStats();

    expect(result).toEqual(
      expect.objectContaining({
        pending: 5,
        published: 9,
        rejected: 2,
        draft: 4,
        reviewedLast7Days: 7,
        approvedLast7Days: 6,
        rejectedLast7Days: 1,
      }),
    );
    expect(typeof result.generatedAt).toBe('string');
  });
});
