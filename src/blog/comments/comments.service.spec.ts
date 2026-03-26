import { Types } from 'mongoose';
import { CommentsService } from './comments.service';

describe('CommentsService', () => {
  let service: CommentsService;
  let commentModel: {
    find: jest.Mock;
    countDocuments: jest.Mock;
    findById: jest.Mock;
    updateOne: jest.Mock;
  };
  let userModel: {
    find: jest.Mock;
  };

  beforeEach(() => {
    commentModel = {
      find: jest.fn(),
      countDocuments: jest.fn(),
      findById: jest.fn(),
      updateOne: jest.fn().mockResolvedValue(undefined),
    };

    userModel = {
      find: jest.fn(),
    };

    service = new CommentsService(
      commentModel as never,
      {} as never,
      userModel as never,
    );
  });

  it('returns hidden comments as placeholder content', async () => {
    const postId = new Types.ObjectId().toString();
    const authorId = new Types.ObjectId();
    const hiddenCommentId = new Types.ObjectId();

    commentModel.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([
        {
          _id: hiddenCommentId,
          postId: new Types.ObjectId(postId),
          authorId,
          content: 'sensitive',
          depth: 1,
          likes: [],
          likesCount: 0,
          isEdited: false,
          isDeleted: false,
          isHidden: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
    });
    commentModel.countDocuments.mockResolvedValue(1);
    userModel.find.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([
        {
          _id: authorId,
          fullName: 'Moderator',
          avatarUrl: undefined,
        },
      ]),
    });

    const result = await service.listByPost(postId, { page: 1, limit: 20 });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].content).toBe('\u1ea8n b\u1edfi staff');
    expect(result.data[0].isHidden).toBe(true);
  });

  it('returns like state with updated likesCount', async () => {
    const commentId = new Types.ObjectId().toString();
    const userId = new Types.ObjectId().toString();

    commentModel.findById
      .mockReturnValueOnce({
        exec: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(commentId),
          isDeleted: false,
          likes: [new Types.ObjectId(userId)],
          likesCount: 3,
        }),
      })
      .mockReturnValueOnce({
        exec: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(commentId),
          isDeleted: false,
          likes: [],
          likesCount: 0,
        }),
      });

    const unlikeResult = await service.toggleLike(commentId, userId);
    const likeResult = await service.toggleLike(commentId, userId);

    expect(unlikeResult).toEqual({ liked: false, likesCount: 2 });
    expect(likeResult).toEqual({ liked: true, likesCount: 1 });
    expect(commentModel.updateOne).toHaveBeenCalledTimes(2);
  });
});
