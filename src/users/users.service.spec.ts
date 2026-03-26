import { UsersService } from './users.service';
import { Role } from '../common/constants/roles.constant';

describe('UsersService', () => {
  let service: UsersService;
  let userModel: {
    exists: jest.Mock;
    create: jest.Mock;
    findOne: jest.Mock;
  };

  beforeEach(() => {
    userModel = {
      exists: jest.fn(),
      create: jest.fn(),
      findOne: jest.fn(),
    };

    const minioService = {
      getBucket: jest.fn(),
      uploadFile: jest.fn(),
      removeObjectByUrl: jest.fn(),
    };

    service = new UsersService(userModel as never, minioService as never);
  });

  it('creates unique username from fullName with suffix on collision', async () => {
    userModel.exists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    userModel.create.mockImplementation(async (payload) => payload);

    const created = await service.create({
      fullName: 'Nguyen Van A',
      email: 'TEST@EXAMPLE.COM',
      password: 'password123',
      role: Role.AUTHOR,
    });

    expect(created.username).toBe('nguyen-van-a-2');
    expect(created.email).toBe('test@example.com');
  });

  it('returns public-safe profile by username', async () => {
    const now = new Date('2026-03-25T00:00:00.000Z');
    const user = {
      id: '67f6d95c15f1af8a57f3d0a1',
      fullName: 'Demo User',
      username: 'demo-user',
      avatarUrl: 'https://example.com/avatar.png',
      followersCount: 8,
      followingCount: 3,
      gamification: {
        xp: 120,
        level: 2,
        xpToNextLevel: 200,
        postsPublished: 4,
        salesCount: 1,
      },
      createdAt: now,
      updatedAt: now,
      isActive: true,
    };

    userModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(user),
    });

    const result = await service.getPublicProfileByUsername('Demo-User');

    expect(result).toEqual(
      expect.objectContaining({
        id: user.id,
        fullName: user.fullName,
        username: user.username,
        followersCount: user.followersCount,
        followingCount: user.followingCount,
      }),
    );
    expect(result).not.toHaveProperty('email');
  });
});

