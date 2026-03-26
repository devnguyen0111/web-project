import {
  Optional,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { MongoTransactionService } from '../common/services/mongo-transaction.service';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/schemas/notification.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { AdminAdjustWalletDto } from './dto/admin-adjust-wallet.dto';
import { CreateDepositDto } from './dto/create-deposit.dto';
import {
  WalletAdminStatsQueryDto,
  WalletStatsGroupBy,
} from './dto/wallet-admin-stats-query.dto';
import { WalletTransactionQueryDto } from './dto/wallet-transaction-query.dto';
import { DepositRequestResponse, DepositService } from './deposit.service';
import {
  PayosReturnStatusPayload,
  PayosReturnSyncPayload,
  PaymentReturnService,
} from './payment-return.service';
import {
  DepositCustomerContext,
  PaymentCallbackResult,
} from './providers/payment-provider.interface';
import {
  ExternalPaymentProvider,
  Transaction,
  TransactionDocument,
  TransactionStatus,
  TransactionType,
} from './schemas/transaction.schema';
import { createDefaultWallet, WalletState } from './schemas/wallet.schema';

type TransactionOptions = {
  description?: string;
  note?: string;
  reference?: {
    model: string;
    id: string;
  };
  counterpartyId?: string;
  processedBy?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
};

type WalletTransactionDirection = 'credit' | 'debit';

type WalletTransactionPayload = Record<string, unknown> & {
  direction: WalletTransactionDirection;
};

type WalletSummary = WalletState & {
  id: string;
  _id: string;
  userId: string;
  coinToVndRate: number;
  availableBalance: number;
  pendingBalance: number;
  totalDeposited: number;
  totalAdjusted: number;
  transactionCount: number;
  currency: string;
  lastTransactionAt?: Date;
};

@Injectable()
export class WalletService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<Transaction>,
    @InjectConnection() private readonly connection: Connection,
    private readonly configService: ConfigService,
    private readonly mongoTransactionService: MongoTransactionService,
    private readonly depositService: DepositService,
    private readonly paymentReturnService: PaymentReturnService,
    @Optional()
    private readonly notificationsService?: NotificationsService,
  ) {}

  async getMyWallet(userId: string): Promise<WalletSummary> {
    const user = await this.findUserOrFail(userId);
    const wallet = this.normalizeWallet(user.wallet);
    const userObjectId = new Types.ObjectId(userId);
    const [pendingDeposit, adminAdjust, transactionCount, latestTransaction] =
      await Promise.all([
        this.transactionModel
          .aggregate<{ _id: null; total: number }>([
            {
              $match: {
                userId: userObjectId,
                type: TransactionType.DEPOSIT,
                status: TransactionStatus.PENDING,
              },
            },
            { $group: { _id: null, total: { $sum: '$amount' } } },
          ])
          .exec(),
        this.transactionModel
          .aggregate<{ _id: null; net: number }>([
            {
              $match: {
                userId: userObjectId,
                type: TransactionType.ADMIN_ADJUST,
                status: TransactionStatus.COMPLETED,
              },
            },
            {
              $group: {
                _id: null,
                net: {
                  $sum: {
                    $subtract: ['$balanceAfter', '$balanceBefore'],
                  },
                },
              },
            },
          ])
          .exec(),
        this.transactionModel.countDocuments({ userId: userObjectId }),
        this.transactionModel
          .findOne({ userId: userObjectId })
          .sort({ createdAt: -1 })
          .select({ createdAt: 1 })
          .lean<{ createdAt?: Date }>()
          .exec(),
      ]);

    const pendingBalance = pendingDeposit[0]?.total ?? 0;
    const totalAdjusted = adminAdjust[0]?.net ?? 0;
    const currency =
      this.configService.get<string>('wallet.providers.payos.currency') ||
      'VND';
    const coinToVndRate =
      this.configService.get<number>('wallet.coinToVndRate') ?? 1000;

    return {
      ...wallet,
      id: user.id,
      _id: user.id,
      userId: user.id,
      coinToVndRate,
      availableBalance: Math.max(wallet.balance - wallet.frozenBalance, 0),
      pendingBalance,
      totalDeposited: wallet.lifetimeDeposit,
      totalAdjusted,
      transactionCount,
      currency,
      lastTransactionAt: latestTransaction?.createdAt,
    };
  }

  async getAdminWalletStats(query: WalletAdminStatsQueryDto) {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    const format = this.getWalletStatsDateFormat(query.groupBy);

    const [walletSummaryAgg, txSummaryAgg, txSeriesAgg, usersWithWallet] =
      await Promise.all([
        this.userModel
          .aggregate<{
            _id: null;
            totalBalance: number;
            totalFrozenBalance: number;
            totalLifetimeDeposit: number;
          }>([
            {
              $group: {
                _id: null,
                totalBalance: { $sum: '$wallet.balance' },
                totalFrozenBalance: { $sum: '$wallet.frozenBalance' },
                totalLifetimeDeposit: { $sum: '$wallet.lifetimeDeposit' },
              },
            },
          ])
          .exec(),
        this.transactionModel
          .aggregate<{
            _id: TransactionType;
            totalAmount: number;
            count: number;
            adminAdjustNet: number;
          }>([
            {
              $match: {
                status: TransactionStatus.COMPLETED,
                type: {
                  $in: [
                    TransactionType.DEPOSIT,
                    TransactionType.ADMIN_ADJUST,
                    TransactionType.REFUND_BUYER,
                    TransactionType.PURCHASE,
                  ],
                },
              },
            },
            {
              $group: {
                _id: '$type',
                totalAmount: { $sum: '$amount' },
                count: { $sum: 1 },
                adminAdjustNet: {
                  $sum: {
                    $cond: [
                      { $eq: ['$type', TransactionType.ADMIN_ADJUST] },
                      { $subtract: ['$balanceAfter', '$balanceBefore'] },
                      0,
                    ],
                  },
                },
              },
            },
          ])
          .exec(),
        this.transactionModel
          .aggregate<{
            _id: string;
            depositAmount: number;
            adminAdjustNet: number;
            refundAmount: number;
            purchaseAmount: number;
            transactionCount: number;
          }>([
            {
              $match: {
                status: TransactionStatus.COMPLETED,
                createdAt: { $gte: from, $lte: to },
                type: {
                  $in: [
                    TransactionType.DEPOSIT,
                    TransactionType.ADMIN_ADJUST,
                    TransactionType.REFUND_BUYER,
                    TransactionType.PURCHASE,
                  ],
                },
              },
            },
            {
              $project: {
                period: {
                  $dateToString: {
                    format,
                    date: '$createdAt',
                  },
                },
                depositAmount: {
                  $cond: [
                    { $eq: ['$type', TransactionType.DEPOSIT] },
                    '$amount',
                    0,
                  ],
                },
                adminAdjustNet: {
                  $cond: [
                    { $eq: ['$type', TransactionType.ADMIN_ADJUST] },
                    { $subtract: ['$balanceAfter', '$balanceBefore'] },
                    0,
                  ],
                },
                refundAmount: {
                  $cond: [
                    { $eq: ['$type', TransactionType.REFUND_BUYER] },
                    '$amount',
                    0,
                  ],
                },
                purchaseAmount: {
                  $cond: [
                    { $eq: ['$type', TransactionType.PURCHASE] },
                    '$amount',
                    0,
                  ],
                },
              },
            },
            {
              $group: {
                _id: '$period',
                depositAmount: { $sum: '$depositAmount' },
                adminAdjustNet: { $sum: '$adminAdjustNet' },
                refundAmount: { $sum: '$refundAmount' },
                purchaseAmount: { $sum: '$purchaseAmount' },
                transactionCount: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ])
          .exec(),
        this.userModel.countDocuments({ wallet: { $exists: true } }),
      ]);

    const summaryByType = txSummaryAgg.reduce<
      Record<
        string,
        { totalAmount: number; count: number; adminAdjustNet: number }
      >
    >((acc, item) => {
      acc[item._id] = {
        totalAmount: item.totalAmount ?? 0,
        count: item.count ?? 0,
        adminAdjustNet: item.adminAdjustNet ?? 0,
      };
      return acc;
    }, {});

    const walletSummary = walletSummaryAgg[0] ?? {
      totalBalance: 0,
      totalFrozenBalance: 0,
      totalLifetimeDeposit: 0,
    };

    const depositSummary = summaryByType[TransactionType.DEPOSIT] ?? {
      totalAmount: 0,
      count: 0,
      adminAdjustNet: 0,
    };
    const refundSummary = summaryByType[TransactionType.REFUND_BUYER] ?? {
      totalAmount: 0,
      count: 0,
      adminAdjustNet: 0,
    };
    const purchaseSummary = summaryByType[TransactionType.PURCHASE] ?? {
      totalAmount: 0,
      count: 0,
      adminAdjustNet: 0,
    };
    const adminAdjustSummary = summaryByType[TransactionType.ADMIN_ADJUST] ?? {
      totalAmount: 0,
      count: 0,
      adminAdjustNet: 0,
    };

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      groupBy: query.groupBy,
      summary: {
        usersWithWallet,
        totalBalance: walletSummary.totalBalance ?? 0,
        totalFrozenBalance: walletSummary.totalFrozenBalance ?? 0,
        totalLifetimeDeposit: walletSummary.totalLifetimeDeposit ?? 0,
        depositTotal: depositSummary.totalAmount,
        depositCount: depositSummary.count,
        adminAdjustTotal: adminAdjustSummary.totalAmount,
        adminAdjustNet: adminAdjustSummary.adminAdjustNet,
        adminAdjustCount: adminAdjustSummary.count,
        refundTotal: refundSummary.totalAmount,
        refundCount: refundSummary.count,
        purchaseTotal: purchaseSummary.totalAmount,
        purchaseCount: purchaseSummary.count,
      },
      series: txSeriesAgg.map((item) => ({
        period: item._id,
        depositAmount: item.depositAmount ?? 0,
        adminAdjustNet: item.adminAdjustNet ?? 0,
        refundAmount: item.refundAmount ?? 0,
        purchaseAmount: item.purchaseAmount ?? 0,
        netFlow:
          (item.depositAmount ?? 0) +
          (item.adminAdjustNet ?? 0) +
          (item.refundAmount ?? 0) -
          (item.purchaseAmount ?? 0),
        transactionCount: item.transactionCount ?? 0,
      })),
      generatedAt: new Date().toISOString(),
    };
  }

  async listMyTransactions(
    userId: string,
    query: WalletTransactionQueryDto,
  ): Promise<PaginatedResponseDto<WalletTransactionPayload>> {
    const skip = (query.page - 1) * query.limit;
    const filter = this.buildTransactionFilter(userId, query);

    const [items, total] = await Promise.all([
      this.transactionModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(query.limit)
        .exec(),
      this.transactionModel.countDocuments(filter),
    ]);

    return new PaginatedResponseDto(
      items.map((item) => this.toWalletTransactionPayload(item)),
      total,
      query.page,
      query.limit,
    );
  }

  async purchase(
    userId: string,
    amount: number,
    options: TransactionOptions = {},
    session?: ClientSession,
  ): Promise<TransactionDocument> {
    return this.executeInTransaction(async (activeSession) => {
      const existing = await this.findExistingTransactionByIdempotencyKey(
        options.idempotencyKey,
        TransactionType.PURCHASE,
        userId,
        activeSession,
      );
      if (existing) {
        return existing;
      }

      return this.applyWalletMutation(
        userId,
        -this.normalizePositiveAmount(amount),
        TransactionType.PURCHASE,
        activeSession,
        options,
      );
    }, session);
  }

  async subscribe(
    userId: string,
    amount: number,
    options: TransactionOptions = {},
    session?: ClientSession,
  ): Promise<TransactionDocument> {
    return this.executeInTransaction(async (activeSession) => {
      const existing = await this.findExistingTransactionByIdempotencyKey(
        options.idempotencyKey,
        TransactionType.SUBSCRIPTION,
        userId,
        activeSession,
      );
      if (existing) {
        return existing;
      }

      return this.applyWalletMutation(
        userId,
        -this.normalizePositiveAmount(amount),
        TransactionType.SUBSCRIPTION,
        activeSession,
        options,
      );
    }, session);
  }

  async reward(
    userId: string,
    amount: number,
    options: TransactionOptions = {},
    session?: ClientSession,
  ): Promise<TransactionDocument> {
    return this.executeInTransaction(async (activeSession) => {
      const existing = await this.findExistingTransactionByIdempotencyKey(
        options.idempotencyKey,
        TransactionType.POST_REWARD,
        userId,
        activeSession,
      );
      if (existing) {
        return existing;
      }

      return this.applyWalletMutation(
        userId,
        this.normalizePositiveAmount(amount),
        TransactionType.POST_REWARD,
        activeSession,
        options,
      );
    }, session);
  }

  async refund(
    userId: string,
    amount: number,
    options: TransactionOptions = {},
    session?: ClientSession,
  ): Promise<TransactionDocument> {
    return this.executeInTransaction(async (activeSession) => {
      const existing = await this.findExistingTransactionByIdempotencyKey(
        options.idempotencyKey,
        TransactionType.REFUND_BUYER,
        userId,
        activeSession,
      );
      if (existing) {
        return existing;
      }

      return this.applyWalletMutation(
        userId,
        this.normalizePositiveAmount(amount),
        TransactionType.REFUND_BUYER,
        activeSession,
        options,
      );
    }, session);
  }

  async recordSaleIncome(
    userId: string,
    amount: number,
    options: TransactionOptions = {},
    session?: ClientSession,
  ): Promise<TransactionDocument> {
    return this.executeInTransaction(async (activeSession) => {
      const existing = await this.findExistingTransactionByIdempotencyKey(
        options.idempotencyKey,
        TransactionType.SALE_INCOME,
        userId,
        activeSession,
      );
      if (existing) {
        return existing;
      }

      return this.applyWalletMutation(
        userId,
        this.normalizePositiveAmount(amount),
        TransactionType.SALE_INCOME,
        activeSession,
        options,
      );
    }, session);
  }

  async recordPlatformFee(
    userId: string,
    amount: number,
    options: TransactionOptions = {},
    session?: ClientSession,
  ): Promise<TransactionDocument> {
    return this.executeInTransaction(async (activeSession) => {
      const existing = await this.findExistingTransactionByIdempotencyKey(
        options.idempotencyKey,
        TransactionType.PLATFORM_FEE,
        userId,
        activeSession,
      );
      if (existing) {
        return existing;
      }

      return this.applyWalletMutation(
        userId,
        -this.normalizePositiveAmount(amount),
        TransactionType.PLATFORM_FEE,
        activeSession,
        options,
      );
    }, session);
  }

  async adminAdjust(
    actorUserId: string,
    dto: AdminAdjustWalletDto,
    session?: ClientSession,
  ): Promise<TransactionDocument> {
    const transaction = await this.executeInTransaction(
      async (activeSession) => {
        const existing = await this.findExistingTransactionByIdempotencyKey(
          dto.idempotencyKey,
          TransactionType.ADMIN_ADJUST,
          dto.userId,
          activeSession,
        );
        if (existing) {
          return existing;
        }

        const amount = this.normalizePositiveAmount(dto.amount);
        const credit =
          dto.credit ??
          (dto.direction ? dto.direction === 'credit' : undefined);
        if (credit === undefined) {
          throw new BadRequestException(
            'Either "credit" or "direction" must be provided',
          );
        }

        const delta = credit ? amount : -amount;
        return this.applyWalletMutation(
          dto.userId,
          delta,
          TransactionType.ADMIN_ADJUST,
          activeSession,
          {
            description: dto.reason || 'Admin wallet adjustment',
            note: dto.note || dto.reason,
            processedBy: actorUserId,
            idempotencyKey: dto.idempotencyKey,
            metadata: {
              actorUserId,
              adjustmentType: credit ? 'credit' : 'debit',
            },
          },
        );
      },
      session,
    );

    await this.safeNotifyWalletUser(
      dto.userId,
      NotificationType.WALLET_ADMIN_ADJUSTED,
      'Your wallet was adjusted by admin',
      dto.reason || 'Admin wallet adjustment has been applied.',
      {
        transactionId: transaction.id,
        actorUserId,
        amount: transaction.amount,
        status: transaction.status,
      },
    );

    return transaction;
  }

  async getDepositRequest(
    userId: string,
    transactionId: string,
  ): Promise<TransactionDocument> {
    return this.depositService.getDepositRequest(userId, transactionId);
  }

  async cancelDepositRequest(
    userId: string,
    transactionId: string,
    reason?: string,
  ): Promise<TransactionDocument> {
    return this.depositService.cancelDepositRequest(
      userId,
      transactionId,
      reason,
    );
  }

  async createDepositRequest(
    userId: string,
    payload: CreateDepositDto,
    context: DepositCustomerContext = {},
  ): Promise<DepositRequestResponse> {
    return this.depositService.createDepositRequest(userId, payload, context);
  }

  async finalizeDepositFromCallback(
    callback: PaymentCallbackResult,
  ): Promise<TransactionDocument> {
    return this.depositService.finalizeDepositFromCallback(callback);
  }

  async markDepositCompleted(
    callback: PaymentCallbackResult,
  ): Promise<TransactionDocument> {
    return this.depositService.markDepositCompleted(callback);
  }

  async markDepositFailed(
    callback: PaymentCallbackResult,
  ): Promise<TransactionDocument> {
    return this.depositService.markDepositFailed(callback);
  }

  async markDepositPending(
    callback: PaymentCallbackResult,
  ): Promise<TransactionDocument> {
    return this.depositService.markDepositPending(callback);
  }

  async handleProviderCallback(
    provider: ExternalPaymentProvider,
    payload: Record<string, unknown>,
    signature?: string,
  ): Promise<TransactionDocument> {
    return this.depositService.handleProviderCallback(
      provider,
      payload,
      signature,
    );
  }

  async handlePayosWebhook(
    payload: Record<string, unknown>,
    signature?: string,
  ): Promise<{
    code: string;
    message: string;
    transaction?: TransactionDocument;
  }> {
    return this.depositService.handlePayosWebhook(payload, signature);
  }

  async syncPayosReturnStatus(
    userIdOrPayload: string | PayosReturnSyncPayload,
    payloadOrSignature?: PayosReturnSyncPayload | string,
    signature?: string,
  ): Promise<{
    code: string;
    message: string;
    transaction?: TransactionDocument;
  }> {
    return this.paymentReturnService.syncPayosReturnStatus(
      userIdOrPayload,
      payloadOrSignature,
      signature,
    );
  }

  async getPayosReturnStatus(
    userIdOrPayload:
      | string
      | {
          orderCode?: string | number;
          paymentLinkId?: string;
          id?: string;
          status?: string;
          cancel?: string | boolean;
          code?: string;
          [key: string]: unknown;
        },
    payload?: {
      orderCode?: string | number;
      paymentLinkId?: string;
      id?: string;
      status?: string;
      cancel?: string | boolean;
      code?: string;
      [key: string]: unknown;
    },
  ): Promise<PayosReturnStatusPayload> {
    return this.paymentReturnService.getPayosReturnStatus(
      userIdOrPayload,
      payload,
    );
  }

  async notifyWalletEvent(input: {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.safeNotifyWalletUser(
      input.userId,
      input.type,
      input.title,
      input.message,
      input.metadata,
    );
  }

  private buildTransactionFilter(
    userId: string,
    query: WalletTransactionQueryDto,
  ): Record<string, unknown> {
    const filter: Record<string, unknown> = {
      userId: new Types.ObjectId(userId),
    };

    if (query.type) {
      filter.type = query.type;
    }

    if (query.status) {
      filter.status = query.status;
    }

    if (query.provider) {
      filter['externalPayment.provider'] = query.provider;
    }

    if (query.externalId) {
      filter['externalPayment.externalId'] = query.externalId;
    }

    if (query.since) {
      filter.createdAt = { $gte: query.since };
    }

    return filter;
  }

  private getWalletStatsDateFormat(groupBy: WalletStatsGroupBy): string {
    if (groupBy === WalletStatsGroupBy.MONTH) {
      return '%Y-%m';
    }

    if (groupBy === WalletStatsGroupBy.WEEK) {
      return '%Y-W%U';
    }

    return '%Y-%m-%d';
  }

  private toWalletTransactionPayload(
    transaction: TransactionDocument,
  ): WalletTransactionPayload {
    const plain = transaction.toObject({ virtuals: true }) as Record<
      string,
      unknown
    >;
    return {
      ...plain,
      direction: this.resolveTransactionDirection(transaction),
    };
  }

  private resolveTransactionDirection(transaction: {
    type: TransactionType;
    balanceBefore: number;
    balanceAfter: number;
  }): WalletTransactionDirection {
    const before = Number(transaction.balanceBefore);
    const after = Number(transaction.balanceAfter);
    if (Number.isFinite(before) && Number.isFinite(after) && after !== before) {
      return after > before ? 'credit' : 'debit';
    }

    const debitTypes = new Set<TransactionType>([
      TransactionType.PURCHASE,
      TransactionType.SUBSCRIPTION,
      TransactionType.PLATFORM_FEE,
      TransactionType.WITHDRAWAL,
      TransactionType.REFUND_STORE,
    ]);

    return debitTypes.has(transaction.type) ? 'debit' : 'credit';
  }

  private async safeNotifyWalletUser(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    if (!this.notificationsService || !Types.ObjectId.isValid(userId)) {
      return;
    }

    await this.notificationsService
      .createWalletNotification({
        userId,
        type,
        title,
        message,
        metadata,
      })
      .catch(() => undefined);
  }

  private async applyWalletMutation(
    userId: string,
    delta: number,
    type: TransactionType,
    session: ClientSession,
    options: TransactionOptions = {},
  ): Promise<TransactionDocument> {
    const user = await this.findUserOrFail(userId, session);
    const wallet = this.normalizeWallet(user.wallet);
    const balanceBefore = wallet.balance;
    const balanceAfter = balanceBefore + delta;

    if (balanceAfter < 0) {
      throw new BadRequestException('Insufficient wallet balance');
    }

    user.wallet = {
      ...wallet,
      balance: balanceAfter,
      totalSpent: [
        TransactionType.PURCHASE,
        TransactionType.SUBSCRIPTION,
        TransactionType.PLATFORM_FEE,
      ].includes(type)
        ? wallet.totalSpent + Math.abs(delta)
        : wallet.totalSpent,
      totalEarned:
        [
          TransactionType.POST_REWARD,
          TransactionType.REFUND_BUYER,
          TransactionType.SALE_INCOME,
        ].includes(type) && delta > 0
          ? wallet.totalEarned + Math.abs(delta)
          : wallet.totalEarned,
      lifetimeDeposit:
        type === TransactionType.DEPOSIT
          ? wallet.lifetimeDeposit + Math.abs(delta)
          : wallet.lifetimeDeposit,
    };

    try {
      const transaction = await this.transactionModel.create(
        [
          {
            userId: new Types.ObjectId(userId),
            type,
            amount: Math.abs(delta),
            balanceBefore,
            balanceAfter,
            status: TransactionStatus.COMPLETED,
            description: options.description,
            note: options.note,
            reference: options.reference
              ? {
                  model: options.reference.model,
                  id: new Types.ObjectId(options.reference.id),
                }
              : undefined,
            counterpartyId: options.counterpartyId
              ? new Types.ObjectId(options.counterpartyId)
              : undefined,
            processedBy: options.processedBy
              ? new Types.ObjectId(options.processedBy)
              : undefined,
            idempotencyKey: options.idempotencyKey,
            metadata: {
              ...(options.metadata ?? {}),
            },
          },
        ],
        { session },
      );

      await user.save({ session });
      return transaction[0];
    } catch (error) {
      if (this.isDuplicateIdempotencyKeyError(error)) {
        const recovered = await this.findExistingTransactionByIdempotencyKey(
          options.idempotencyKey,
          type,
          userId,
          session,
        );
        if (recovered) {
          return recovered;
        }

        const reused = options.idempotencyKey
          ? await this.findTransactionByIdempotencyKey(
              options.idempotencyKey,
              session,
            )
          : null;
        if (reused) {
          throw new ConflictException(
            'A transaction with the same idempotency key already exists',
          );
        }

        throw new ConflictException(
          'A transaction with the same idempotency key already exists',
        );
      }

      throw error;
    }
  }

  private executeInTransaction<T>(
    callback: (session: ClientSession) => Promise<T>,
    session?: ClientSession,
  ): Promise<T> {
    return this.mongoTransactionService.executeInTransaction(
      this.connection,
      callback,
      session,
    );
  }

  private async findUserOrFail(
    userId: string,
    session?: ClientSession,
  ): Promise<UserDocument> {
    const query = this.userModel.findById(userId);
    if (session) {
      query.session(session);
    }

    const user = await query.exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.wallet) {
      user.wallet = createDefaultWallet() as never;
    }

    return user;
  }

  private normalizeWallet(wallet?: Partial<WalletState>): WalletState {
    const defaults = createDefaultWallet();
    return {
      balance: wallet?.balance ?? defaults.balance,
      frozenBalance: wallet?.frozenBalance ?? defaults.frozenBalance,
      totalEarned: wallet?.totalEarned ?? defaults.totalEarned,
      totalSpent: wallet?.totalSpent ?? defaults.totalSpent,
      lifetimeDeposit: wallet?.lifetimeDeposit ?? defaults.lifetimeDeposit,
    };
  }

  private normalizePositiveAmount(amount: number): number {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Amount must be greater than zero');
    }

    return amount;
  }

  private async findExistingTransactionByIdempotencyKey(
    idempotencyKey: string | undefined,
    type: TransactionType,
    userId: string,
    session?: ClientSession,
  ): Promise<TransactionDocument | null> {
    if (!idempotencyKey) {
      return null;
    }

    const query = this.transactionModel.findOne({
      idempotencyKey,
      type,
      userId: new Types.ObjectId(userId),
    });
    if (session) {
      query.session(session);
    }

    return query.exec();
  }

  private async findTransactionByIdempotencyKey(
    idempotencyKey: string,
    session?: ClientSession,
  ): Promise<TransactionDocument | null> {
    const query = this.transactionModel.findOne({ idempotencyKey });
    if (session) {
      query.session(session);
    }

    return query.exec();
  }

  private isDuplicateIdempotencyKeyError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const code =
      'code' in error ? (error as { code?: unknown }).code : undefined;
    if (code === 11000 || code === 11001 || code === 12582) {
      return true;
    }

    const message =
      'message' in error &&
      typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message
        : '';

    return message.includes('E11000 duplicate key error');
  }
}
