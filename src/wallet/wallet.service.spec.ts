import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { MongoTransactionService } from '../common/services/mongo-transaction.service';
import { DepositService } from './deposit.service';
import { PaymentReturnService } from './payment-return.service';
import { WalletService } from './wallet.service';
import { User } from '../users/schemas/user.schema';
import { Transaction, TransactionType } from './schemas/transaction.schema';
import { PaymentProviderManager } from './providers/payment-provider.manager';
import { createDefaultWallet } from './schemas/wallet.schema';

const buildQuery = <T>(result: T) => {
  const query = {
    session: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(result),
  };

  return query;
};

const buildAggregation = <T>(result: T) => ({
  exec: jest.fn().mockResolvedValue(result),
});

const buildDuplicateKeyError = () =>
  Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });

describe('WalletService', () => {
  let service: WalletService;
  let userModel: {
    findById: jest.Mock;
    findOne: jest.Mock;
    aggregate: jest.Mock;
    countDocuments: jest.Mock;
  };
  let transactionModel: {
    findOne: jest.Mock;
    findById: jest.Mock;
    countDocuments: jest.Mock;
    find: jest.Mock;
    aggregate: jest.Mock;
    create: jest.Mock;
  };
  let configService: {
    get: jest.Mock;
  };
  let paymentProviderManager: {
    createPaymentIntent: jest.Mock;
    verifyCallback: jest.Mock;
    cancelPaymentIntent: jest.Mock;
  };
  let connection: {
    startSession: jest.Mock;
    db?: {
      admin: jest.Mock;
    };
  };
  let mongoTransactionService: MongoTransactionService;
  let depositService: DepositService;
  let paymentReturnService: PaymentReturnService;

  beforeEach(() => {
    userModel = {
      findById: jest.fn(),
      findOne: jest.fn(),
      aggregate: jest.fn(),
      countDocuments: jest.fn(),
    };
    transactionModel = {
      findOne: jest.fn(),
      findById: jest.fn(),
      countDocuments: jest.fn(),
      find: jest.fn(),
      aggregate: jest.fn(),
      create: jest.fn(),
    };
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'wallet.postRewardCoins') {
          return 25;
        }

        if (key === 'wallet.depositFraudWindowMinutes') {
          return 15;
        }

        if (key === 'wallet.depositFraudThreshold') {
          return 3;
        }

        return undefined;
      }),
    };
    paymentProviderManager = {
      createPaymentIntent: jest.fn(),
      verifyCallback: jest.fn(),
      cancelPaymentIntent: jest.fn(),
    };
    connection = {
      startSession: jest.fn(),
    };
    mongoTransactionService = new MongoTransactionService(
      configService as unknown as ConfigService,
    );
    depositService = new DepositService(
      userModel as unknown as Model<User>,
      transactionModel as unknown as Model<Transaction>,
      connection as never,
      configService as unknown as ConfigService,
      paymentProviderManager as unknown as PaymentProviderManager,
      mongoTransactionService,
    );
    paymentReturnService = new PaymentReturnService(
      transactionModel as unknown as Model<Transaction>,
      connection as never,
      paymentProviderManager as unknown as PaymentProviderManager,
      mongoTransactionService,
    );

    service = new WalletService(
      userModel as unknown as Model<User>,
      transactionModel as unknown as Model<Transaction>,
      connection as never,
      configService as unknown as ConfigService,
      mongoTransactionService,
      depositService,
      paymentReturnService,
    );
  });

  it('purchases coins in a session-safe way and prevents negative balance', async () => {
    const session = { id: 'session-1' } as never;
    const user = {
      _id: new Types.ObjectId(),
      id: new Types.ObjectId().toString(),
      wallet: { ...createDefaultWallet(), balance: 100 },
      save: jest.fn().mockResolvedValue(undefined),
    };
    const transaction = { id: 'tx-1' };
    userModel.findById.mockReturnValue(buildQuery(user));
    transactionModel.findOne.mockReturnValue(buildQuery(null));
    transactionModel.create.mockResolvedValue([transaction]);

    const result = await service.purchase(
      user.id,
      40,
      {
        idempotencyKey: 'purchase-1',
        description: 'buy content',
      },
      session,
    );

    expect(result).toBe(transaction);
    expect(user.wallet.balance).toBe(60);
    expect(user.wallet.totalSpent).toBe(40);
    expect(user.save).toHaveBeenCalledWith({ session });
    expect(transactionModel.create).toHaveBeenCalledTimes(1);
    await expect(
      service.purchase(
        user.id,
        1000,
        { idempotencyKey: 'purchase-2' },
        session,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('subtracts wallet balance for subscription charges', async () => {
    const session = { id: 'session-subscribe-1' } as never;
    const user = {
      _id: new Types.ObjectId(),
      id: new Types.ObjectId().toString(),
      wallet: { ...createDefaultWallet(), balance: 100_000, totalSpent: 0 },
      save: jest.fn().mockResolvedValue(undefined),
    };
    const transaction = { id: 'tx-subscription-1' };
    userModel.findById.mockReturnValue(buildQuery(user));
    transactionModel.findOne.mockReturnValue(buildQuery(null));
    transactionModel.create.mockResolvedValue([transaction]);

    const result = await service.subscribe(
      user.id,
      40_000,
      { idempotencyKey: 'subscription-1' },
      session,
    );

    expect(result).toBe(transaction);
    expect(user.wallet.balance).toBe(60_000);
    expect(user.wallet.totalSpent).toBe(40_000);
    expect(user.save).toHaveBeenCalledWith({ session });
  });

  it('credits reward coins exactly once when idempotency key is reused', async () => {
    const session = { id: 'session-2' } as never;
    const user = {
      _id: new Types.ObjectId(),
      id: new Types.ObjectId().toString(),
      wallet: { ...createDefaultWallet(), balance: 20 },
      save: jest.fn().mockResolvedValue(undefined),
    };
    const existingTransaction = {
      id: 'tx-existing',
      type: TransactionType.POST_REWARD,
      userId: user._id,
      amount: 25,
      balanceBefore: 20,
      balanceAfter: 45,
    };
    userModel.findById.mockReturnValue(buildQuery(user));
    transactionModel.findOne.mockReturnValue(buildQuery(existingTransaction));

    const result = await service.reward(
      user.id,
      25,
      {
        idempotencyKey: 'post-reward:post-1',
      },
      session,
    );

    expect(result).toBe(existingTransaction);
    expect(user.wallet.balance).toBe(20);
    expect(transactionModel.create).not.toHaveBeenCalled();
    expect(user.save).not.toHaveBeenCalled();
  });

  it('refunds coins and keeps the wallet non-negative', async () => {
    const session = { id: 'session-3' } as never;
    const user = {
      _id: new Types.ObjectId(),
      id: new Types.ObjectId().toString(),
      wallet: { ...createDefaultWallet(), balance: 50 },
      save: jest.fn().mockResolvedValue(undefined),
    };
    const transaction = { id: 'tx-refund' };
    userModel.findById.mockReturnValue(buildQuery(user));
    transactionModel.findOne.mockReturnValue(buildQuery(null));
    transactionModel.create.mockResolvedValue([transaction]);

    const result = await service.refund(
      user.id,
      15,
      {
        idempotencyKey: 'refund-1',
        note: 'buyer refund',
      },
      session,
    );

    expect(result).toBe(transaction);
    expect(user.wallet.balance).toBe(65);
    expect(user.wallet.totalSpent).toBe(0);
    expect(user.save).toHaveBeenCalledWith({ session });
  });

  it('throws before mutating when the wallet lacks balance for a purchase', async () => {
    const session = { id: 'session-4' } as never;
    const user = {
      _id: new Types.ObjectId(),
      id: new Types.ObjectId().toString(),
      wallet: { ...createDefaultWallet(), balance: 5 },
      save: jest.fn().mockResolvedValue(undefined),
    };
    userModel.findById.mockReturnValue(buildQuery(user));
    transactionModel.findOne.mockReturnValue(buildQuery(null));

    await expect(
      service.purchase(
        user.id,
        10,
        {
          idempotencyKey: 'purchase-insufficient',
        },
        session,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(transactionModel.create).not.toHaveBeenCalled();
    expect(user.save).not.toHaveBeenCalled();
    expect(user.wallet.balance).toBe(5);
  });

  it('returns the existing transaction when a purchase idempotency key races on duplicate insert', async () => {
    const startedSession = {
      withTransaction: jest.fn(),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    connection.startSession.mockResolvedValue(startedSession);
    connection.db = {
      admin: jest.fn().mockReturnValue({
        command: jest.fn().mockResolvedValue({}),
      }),
    };

    const user = {
      _id: new Types.ObjectId(),
      id: new Types.ObjectId().toString(),
      wallet: { ...createDefaultWallet(), balance: 100 },
      save: jest.fn().mockResolvedValue(undefined),
    };
    const existingTransaction = {
      id: 'tx-existing',
      type: TransactionType.PURCHASE,
      userId: user._id,
      amount: 40,
      balanceBefore: 100,
      balanceAfter: 60,
    };
    userModel.findById.mockReturnValue(buildQuery(user));
    transactionModel.findOne
      .mockReturnValueOnce(buildQuery(null))
      .mockReturnValueOnce(buildQuery(existingTransaction));
    transactionModel.create.mockRejectedValue(buildDuplicateKeyError());

    const result = await service.purchase(user.id, 40, {
      idempotencyKey: 'purchase-race-1',
      description: 'buy content',
    });

    expect(result).toBe(existingTransaction);
    expect(user.save).not.toHaveBeenCalled();
    expect(transactionModel.create).toHaveBeenCalledTimes(1);
  });

  it('falls back to non-transactional session when mongodb is standalone', async () => {
    const startedSession = {
      withTransaction: jest.fn(),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    connection.startSession.mockResolvedValue(startedSession);
    connection.db = {
      admin: jest.fn().mockReturnValue({
        command: jest.fn().mockResolvedValue({}),
      }),
    };

    const user = {
      _id: new Types.ObjectId(),
      id: new Types.ObjectId().toString(),
      wallet: { ...createDefaultWallet(), balance: 100 },
      save: jest.fn().mockResolvedValue(undefined),
    };
    const transaction = { id: 'tx-standalone' };
    userModel.findById.mockReturnValue(buildQuery(user));
    transactionModel.findOne.mockReturnValue(buildQuery(null));
    let resolveCreate: ((value: unknown) => void) | undefined;
    const createPromise = new Promise((resolve) => {
      resolveCreate = resolve;
    });
    transactionModel.create.mockReturnValue(createPromise);

    const purchasePromise = service.purchase(user.id, 10, {
      idempotencyKey: 'purchase-standalone',
    });
    await Promise.resolve();
    expect(startedSession.endSession).not.toHaveBeenCalled();
    resolveCreate?.([transaction]);
    const result = await purchasePromise;

    expect(result).toBe(transaction);
    expect(startedSession.withTransaction).not.toHaveBeenCalled();
    expect(user.save).toHaveBeenCalledWith({ session: startedSession });
    expect(startedSession.endSession).toHaveBeenCalledTimes(1);
  });

  it('retries without transaction when topology probe misses and server rejects transactions', async () => {
    const startedSession = {
      withTransaction: jest
        .fn()
        .mockRejectedValue(
          new Error(
            'Transaction numbers are only allowed on a replica set member or mongos',
          ),
        ),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    connection.startSession.mockResolvedValue(startedSession);
    connection.db = {
      admin: jest.fn().mockReturnValue({
        command: jest.fn().mockRejectedValue(new Error('probe failed')),
      }),
    };

    const user = {
      _id: new Types.ObjectId(),
      id: new Types.ObjectId().toString(),
      wallet: { ...createDefaultWallet(), balance: 100 },
      save: jest.fn().mockResolvedValue(undefined),
    };
    const transaction = { id: 'tx-fallback' };
    userModel.findById.mockReturnValue(buildQuery(user));
    transactionModel.findOne.mockReturnValue(buildQuery(null));
    transactionModel.create.mockResolvedValue([transaction]);

    const result = await service.purchase(user.id, 10, {
      idempotencyKey: 'purchase-fallback',
    });

    expect(result).toBe(transaction);
    expect(startedSession.withTransaction).toHaveBeenCalledTimes(1);
    expect(user.save).toHaveBeenCalledWith({ session: startedSession });
    expect(startedSession.endSession).toHaveBeenCalledTimes(1);
  });

  it('stores payos orderCode on deposit request to avoid null unique-index collisions', async () => {
    const startedSession = {
      withTransaction: jest.fn(),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    connection.startSession.mockResolvedValue(startedSession);
    connection.db = {
      admin: jest.fn().mockReturnValue({
        command: jest.fn().mockResolvedValue({}),
      }),
    };

    const user = {
      _id: new Types.ObjectId(),
      id: new Types.ObjectId().toString(),
      wallet: { ...createDefaultWallet(), balance: 0 },
      save: jest.fn().mockResolvedValue(undefined),
    };
    userModel.findById.mockReturnValue(buildQuery(user));
    transactionModel.findOne.mockReturnValue(buildQuery(null));
    transactionModel.countDocuments.mockResolvedValue(0);
    paymentProviderManager.createPaymentIntent.mockResolvedValue({
      externalId: '1773857144847',
      orderCode: 1773857144847,
      paymentUrl: 'https://pay.payos.vn/web/test',
      checkoutUrl: 'https://pay.payos.vn/web/test',
      providerPayload: {},
    });
    transactionModel.create.mockImplementation(async (docs) => docs);

    const result = await service.createDepositRequest(
      user.id,
      { amount: 10000, provider: 'payos' } as never,
      { ip: '127.0.0.1', userAgent: 'jest' },
    );

    expect(result.externalId).toBe('1773857144847');
    expect(transactionModel.create).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          externalPayment: expect.objectContaining({
            provider: 'payos',
            externalId: '1773857144847',
            orderCode: 1773857144847,
          }),
        }),
      ]),
      { session: startedSession },
    );
    expect(startedSession.withTransaction).not.toHaveBeenCalled();
    expect(startedSession.endSession).toHaveBeenCalledTimes(1);
  });

  it('returns the existing deposit request when a duplicate idempotency key is inserted concurrently', async () => {
    const startedSession = {
      withTransaction: jest.fn(),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    connection.startSession.mockResolvedValue(startedSession);
    connection.db = {
      admin: jest.fn().mockReturnValue({
        command: jest.fn().mockResolvedValue({}),
      }),
    };

    const user = {
      _id: new Types.ObjectId(),
      id: new Types.ObjectId().toString(),
      wallet: { ...createDefaultWallet(), balance: 0 },
      save: jest.fn().mockResolvedValue(undefined),
    };
    const existingTransaction = {
      id: 'tx-deposit-existing',
      type: TransactionType.DEPOSIT,
      userId: user._id,
      amount: 100,
      balanceBefore: 0,
      balanceAfter: 0,
      externalPayment: {
        provider: 'payos',
        externalId: '1773857144847',
        paymentLinkId: 'payment-link-1',
      },
    };
    userModel.findById.mockReturnValue(buildQuery(user));
    transactionModel.findOne
      .mockReturnValueOnce(buildQuery(null))
      .mockReturnValueOnce(buildQuery(existingTransaction));
    transactionModel.countDocuments.mockResolvedValue(0);
    paymentProviderManager.createPaymentIntent.mockResolvedValue({
      externalId: '1773857144847',
      orderCode: 1773857144847,
      paymentUrl: 'https://pay.payos.vn/web/orphan-payment-link',
      checkoutUrl: 'https://pay.payos.vn/web/orphan-payment-link',
      paymentLinkId: 'orphan-payment-link',
      providerPayload: {},
    });
    transactionModel.create.mockRejectedValue(buildDuplicateKeyError());

    const result = await service.createDepositRequest(
      user.id,
      {
        amount: 100,
        idempotencyKey: 'deposit-race-1',
      } as never,
      { ip: '127.0.0.1', userAgent: 'jest' },
    );

    expect(result.transaction).toBe(existingTransaction);
    expect(result.externalId).toBe('1773857144847');
    expect(result.paymentUrl).toBe('https://pay.payos.vn/web/payment-link-1');
    expect(paymentProviderManager.createPaymentIntent).toHaveBeenCalledTimes(1);
    expect(transactionModel.create).toHaveBeenCalledTimes(1);
  });

  it('returns wallet summary fields used by frontend wallet card', async () => {
    const user = {
      _id: new Types.ObjectId(),
      id: new Types.ObjectId().toString(),
      wallet: {
        ...createDefaultWallet(),
        balance: 120,
        frozenBalance: 20,
        totalSpent: 35,
        lifetimeDeposit: 450,
      },
    };
    const lastTransactionAt = new Date('2026-03-18T18:14:47.130Z');
    userModel.findById.mockReturnValue(buildQuery(user));
    transactionModel.aggregate
      .mockReturnValueOnce(buildAggregation([{ _id: null, total: 80 }]))
      .mockReturnValueOnce(buildAggregation([{ _id: null, net: 15 }]));
    transactionModel.countDocuments.mockResolvedValue(9);
    transactionModel.findOne.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue({ createdAt: lastTransactionAt }),
    });

    const result = await service.getMyWallet(user.id);

    expect(result).toEqual(
      expect.objectContaining({
        id: user.id,
        _id: user.id,
        userId: user.id,
        balance: 120,
        availableBalance: 100,
        pendingBalance: 80,
        totalDeposited: 450,
        totalAdjusted: 15,
        totalSpent: 35,
        currency: 'VND',
        coinToVndRate: 1000,
        transactionCount: 9,
        lastTransactionAt,
      }),
    );
  });

  it('aggregates admin wallet stats summary and series', async () => {
    userModel.aggregate.mockReturnValue(
      buildAggregation([
        {
          _id: null,
          totalBalance: 1000,
          totalFrozenBalance: 120,
          totalLifetimeDeposit: 3000,
        },
      ]),
    );
    userModel.countDocuments.mockResolvedValue(12);

    transactionModel.aggregate
      .mockReturnValueOnce(
        buildAggregation([
          {
            _id: TransactionType.DEPOSIT,
            totalAmount: 5000,
            count: 8,
            adminAdjustNet: 0,
          },
          {
            _id: TransactionType.ADMIN_ADJUST,
            totalAmount: 200,
            count: 3,
            adminAdjustNet: -50,
          },
          {
            _id: TransactionType.REFUND_BUYER,
            totalAmount: 300,
            count: 2,
            adminAdjustNet: 0,
          },
          {
            _id: TransactionType.PURCHASE,
            totalAmount: 1400,
            count: 6,
            adminAdjustNet: 0,
          },
        ]),
      )
      .mockReturnValueOnce(
        buildAggregation([
          {
            _id: '2026-03-20',
            depositAmount: 1000,
            adminAdjustNet: -20,
            refundAmount: 100,
            purchaseAmount: 500,
            transactionCount: 4,
          },
        ]),
      );

    const result = await service.getAdminWalletStats({
      from: '2026-03-01T00:00:00.000Z',
      to: '2026-03-31T23:59:59.999Z',
      groupBy: 'day',
    } as never);

    expect(result.summary).toEqual(
      expect.objectContaining({
        usersWithWallet: 12,
        totalBalance: 1000,
        totalFrozenBalance: 120,
        totalLifetimeDeposit: 3000,
        depositTotal: 5000,
        adminAdjustNet: -50,
        refundTotal: 300,
        purchaseTotal: 1400,
      }),
    );
    expect(result.series).toEqual([
      expect.objectContaining({
        period: '2026-03-20',
        depositAmount: 1000,
        adminAdjustNet: -20,
        refundAmount: 100,
        purchaseAmount: 500,
        netFlow: 580,
      }),
    ]);
  });

  it('returns subscription transaction as debit direction for wallet history', async () => {
    const userId = new Types.ObjectId().toString();
    const createdAt = new Date('2026-03-19T12:00:00.000Z');
    const transactionDoc = {
      toObject: jest.fn().mockReturnValue({
        id: 'tx-sub-1',
        _id: new Types.ObjectId(),
        userId,
        type: TransactionType.SUBSCRIPTION,
        amount: 40000,
        status: 'completed',
        balanceBefore: 145000,
        balanceAfter: 105000,
        createdAt,
        updatedAt: createdAt,
      }),
      type: TransactionType.SUBSCRIPTION,
      balanceBefore: 145000,
      balanceAfter: 105000,
    };

    transactionModel.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([transactionDoc]),
    });
    transactionModel.countDocuments.mockResolvedValue(1);

    const result = await service.listMyTransactions(userId, {
      page: 1,
      limit: 10,
    } as never);

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        type: TransactionType.SUBSCRIPTION,
        direction: 'debit',
      }),
    );
  });

  it('marks pending deposit as failed when payos return indicates cancel', async () => {
    const startedSession = {
      withTransaction: jest.fn(),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    connection.startSession.mockResolvedValue(startedSession);
    connection.db = {
      admin: jest.fn().mockReturnValue({
        command: jest.fn().mockResolvedValue({}),
      }),
    };

    const transaction: any = {
      status: 'pending',
      failureReason: undefined,
      metadata: {},
      save: jest.fn().mockResolvedValue(undefined),
    };
    transactionModel.findOne.mockReturnValue({
      session: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(transaction),
    });
    paymentProviderManager.verifyCallback.mockReturnValue({
      signatureValid: true,
    });

    const result = await service.syncPayosReturnStatus(
      {
        orderCode: '1773857686372',
        paymentLinkId: 'f60d5607d7d04b29842ea25e16b6a0b5',
        status: 'CANCELLED',
        cancel: 'true',
        code: '00',
        id: 'f60d5607d7d04b29842ea25e16b6a0b5',
      },
      'valid-signature',
    );

    expect(result.code).toBe('00');
    expect(transaction.status).toBe('failed');
    expect(transaction.failureReason).toBe('CANCELLED');
    expect(transaction.save).toHaveBeenCalledWith({ session: startedSession });
  });

  it('does not overwrite completed deposit when return-sync says cancel', async () => {
    const startedSession = {
      withTransaction: jest.fn(),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    connection.startSession.mockResolvedValue(startedSession);
    connection.db = {
      admin: jest.fn().mockReturnValue({
        command: jest.fn().mockResolvedValue({}),
      }),
    };

    const transaction = {
      status: 'completed',
      save: jest.fn().mockResolvedValue(undefined),
    };
    transactionModel.findOne.mockReturnValue({
      session: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(transaction),
    });
    paymentProviderManager.verifyCallback.mockReturnValue({
      signatureValid: true,
    });

    const result = await service.syncPayosReturnStatus(
      {
        orderCode: '1773857686372',
        status: 'CANCELLED',
        cancel: 'true',
      },
      'valid-signature',
    );

    expect(result.code).toBe('00');
    expect(transaction.status).toBe('completed');
    expect(transaction.save).not.toHaveBeenCalled();
  });

  it('cancels pending deposit request and marks transaction as failed', async () => {
    const startedSession = {
      withTransaction: jest.fn(),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    connection.startSession.mockResolvedValue(startedSession);
    connection.db = {
      admin: jest.fn().mockReturnValue({
        command: jest.fn().mockResolvedValue({}),
      }),
    };

    const userId = new Types.ObjectId().toString();
    const transaction = {
      _id: new Types.ObjectId(),
      userId: new Types.ObjectId(userId),
      type: TransactionType.DEPOSIT,
      status: 'pending',
      externalPayment: {
        provider: 'payos',
        externalId: '1773857686372',
        paymentLinkId: 'f60d5607d7d04b29842ea25e16b6a0b5',
      },
      metadata: {},
      save: jest.fn().mockResolvedValue(undefined),
    };
    transactionModel.findById.mockReturnValue({
      session: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(transaction),
    });
    paymentProviderManager.cancelPaymentIntent.mockResolvedValue({
      success: true,
      status: 'CANCELLED',
      message: 'Cancelled by user',
      providerPayload: { code: '00' },
    });

    const result = await service.cancelDepositRequest(
      userId,
      transaction._id.toString(),
      'Cancelled from dashboard',
    );

    expect(result).toBe(transaction);
    expect(paymentProviderManager.cancelPaymentIntent).toHaveBeenCalledWith(
      'payos',
      expect.objectContaining({
        externalId: '1773857686372',
        paymentLinkId: 'f60d5607d7d04b29842ea25e16b6a0b5',
      }),
    );
    expect(transaction.status).toBe('failed');
    expect(transaction.failureReason).toBe('Cancelled from dashboard');
    expect(transaction.save).toHaveBeenCalledWith({ session: startedSession });
  });

  it('rejects cancel request when deposit is already completed', async () => {
    const startedSession = {
      withTransaction: jest.fn(),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    connection.startSession.mockResolvedValue(startedSession);
    connection.db = {
      admin: jest.fn().mockReturnValue({
        command: jest.fn().mockResolvedValue({}),
      }),
    };

    const userId = new Types.ObjectId().toString();
    const transaction = {
      _id: new Types.ObjectId(),
      userId: new Types.ObjectId(userId),
      type: TransactionType.DEPOSIT,
      status: 'completed',
    };
    transactionModel.findById.mockReturnValue({
      session: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(transaction),
    });

    await expect(
      service.cancelDepositRequest(userId, transaction._id.toString()),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(paymentProviderManager.cancelPaymentIntent).not.toHaveBeenCalled();
  });
});
