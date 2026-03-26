import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { MongoTransactionService } from '../common/services/mongo-transaction.service';
import { NotificationsService } from '../notifications/notifications.service';
import { User } from '../users/schemas/user.schema';
import { Transaction } from '../wallet/schemas/transaction.schema';
import { WalletService } from '../wallet/wallet.service';
import { SubscriptionPlanCode } from './subscription.constants';
import { createDefaultSubscription } from './schemas/subscription.schema';
import { SubscriptionsService } from './subscriptions.service';

const buildQuery = <T>(result: T) => ({
  session: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  sort: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue(result),
});

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;
  let userModel: {
    findById: jest.Mock;
    find: jest.Mock;
  };
  let transactionModel: {
    find: jest.Mock;
    countDocuments: jest.Mock;
  };
  let walletService: {
    subscribe: jest.Mock;
  };
  let connection: {
    startSession: jest.Mock;
    db?: {
      admin: jest.Mock;
    };
  };
  let configService: {
    get: jest.Mock;
  };
  let notificationsService: {
    createSubscriptionNotification: jest.Mock;
  };
  let mongoTransactionService: MongoTransactionService;

  beforeEach(() => {
    userModel = {
      findById: jest.fn(),
      find: jest.fn().mockReturnValue(buildQuery([])),
    };
    transactionModel = {
      find: jest.fn().mockReturnValue(buildQuery([])),
      countDocuments: jest.fn().mockResolvedValue(0),
    };
    walletService = {
      subscribe: jest.fn().mockResolvedValue({ id: 'tx-sub-1' }),
    };
    connection = {
      startSession: jest.fn(),
      db: {
        admin: jest.fn().mockReturnValue({
          command: jest.fn().mockResolvedValue({}),
        }),
      },
    };
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'wallet.coinToVndRate') {
          return 1000;
        }

        return undefined;
      }),
    };
    notificationsService = {
      createSubscriptionNotification: jest.fn().mockResolvedValue(undefined),
    };
    mongoTransactionService = new MongoTransactionService(
      configService as unknown as ConfigService,
    );

    service = new SubscriptionsService(
      userModel as unknown as Model<User>,
      transactionModel as unknown as Model<Transaction>,
      connection as never,
      walletService as unknown as WalletService,
      configService as unknown as ConfigService,
      mongoTransactionService,
      notificationsService as unknown as NotificationsService,
    );
  });

  it('returns free plan with 5 monthly posts for users without subscription', async () => {
    const user = {
      id: new Types.ObjectId().toString(),
      subscription: undefined,
      save: jest.fn().mockResolvedValue(undefined),
    };
    userModel.findById.mockReturnValue(buildQuery(user));

    const result = await service.getMySubscription(user.id);

    expect(result.subscription.planCode).toBe(SubscriptionPlanCode.FREE);
    expect(result.quota.allowedPosts).toBe(5);
    expect(result.quota.remainingPosts).toBe(5);
    expect(user.save).toHaveBeenCalled();
  });

  it('purchases paid subscription and charges wallet once', async () => {
    const startedSession = {
      withTransaction: jest.fn(async (callback: () => Promise<void>) =>
        callback(),
      ),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    connection.startSession.mockResolvedValue(startedSession);

    const user = {
      id: new Types.ObjectId().toString(),
      email: 'dev@example.com',
      subscription: createDefaultSubscription(
        new Date('2026-03-19T10:00:00.000Z'),
      ),
      save: jest.fn().mockResolvedValue(undefined),
    };
    userModel.findById.mockReturnValue(buildQuery(user));

    const result = await service.purchaseMySubscription(user.id, {
      planCode: SubscriptionPlanCode.PRO,
      months: 2,
      idempotencyKey: 'sub-renew-1',
    });

    expect(result.subscription.planCode).toBe(SubscriptionPlanCode.PRO);
    expect(result.quota.allowedPosts).toBe(20);
    expect(walletService.subscribe).toHaveBeenCalledTimes(1);
    expect(walletService.subscribe).toHaveBeenCalledWith(
      user.id,
      180_000,
      expect.any(Object),
      startedSession,
    );
    expect(user.save).toHaveBeenCalledWith({ session: startedSession });
  });

  it('blocks quota consumption when remaining posts are zero', async () => {
    const startedSession = {
      withTransaction: jest.fn(async (callback: () => Promise<void>) =>
        callback(),
      ),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    connection.startSession.mockResolvedValue(startedSession);

    const exhaustedSubscription = createDefaultSubscription(
      new Date('2026-03-19T10:00:00.000Z'),
    );
    exhaustedSubscription.postsUsedInPeriod = 5;

    const user = {
      id: new Types.ObjectId().toString(),
      subscription: exhaustedSubscription,
      save: jest.fn().mockResolvedValue(undefined),
    };
    userModel.findById.mockReturnValue(buildQuery(user));

    await expect(service.consumePostQuota(user.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(user.save).not.toHaveBeenCalled();
  });

  it('throws not found when user does not exist', async () => {
    userModel.findById.mockReturnValue(buildQuery(null));

    await expect(
      service.getMySubscription(new Types.ObjectId().toString()),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
