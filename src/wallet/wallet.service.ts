import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import { User, UserDocument } from '../users/schemas/user.schema';
import { createDefaultWallet, WalletState } from './schemas/wallet.schema';
import {
  ExternalPaymentProvider,
  Transaction,
  TransactionDocument,
  TransactionStatus,
  TransactionType,
} from './schemas/transaction.schema';
import { PaymentProviderManager } from './providers/payment-provider.manager';
import {
  DepositCustomerContext,
  PaymentCallbackResult,
} from './providers/payment-provider.interface';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { AdminAdjustWalletDto } from './dto/admin-adjust-wallet.dto';
import { WalletTransactionQueryDto } from './dto/wallet-transaction-query.dto';

type WalletTransactionFilter = {
  type?: TransactionType;
  status?: TransactionStatus;
  provider?: ExternalPaymentProvider;
  externalId?: string;
  since?: Date;
};

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
  availableBalance: number;
  pendingBalance: number;
  totalDeposited: number;
  totalAdjusted: number;
  transactionCount: number;
  currency: string;
  lastTransactionAt?: Date;
};

type PayosReturnUiStatus =
  | 'success'
  | 'pending'
  | 'failed'
  | 'cancelled'
  | 'verifying'
  | 'unknown';

type PayosReturnStatusPayload = {
  provider: ExternalPaymentProvider.PAYOS;
  status: PayosReturnUiStatus;
  message: string;
  hints: {
    status?: string;
    code?: string;
    cancel: boolean;
  };
  transaction?: {
    id: string;
    type: TransactionType;
    status: TransactionStatus;
    amountReal: number;
    currency: string;
    coinAmount: number;
    paymentMethod: string;
    provider: ExternalPaymentProvider.PAYOS;
    orderCode?: string;
    paymentLinkId?: string;
    checkoutUrl?: string;
    createdAt?: Date;
    confirmedAt?: Date;
    failedAt?: Date;
    balanceBefore: number;
    balanceAfter: number;
    failureReason?: string;
  };
  walletTopup?: {
    coinAmount: number;
    amountReal: number;
    currency: string;
    exchangeRate: number;
    balanceBefore: number;
    balanceAfter: number;
    walletTransactionId: string;
    note: string;
  };
};

@Injectable()
export class WalletService {
  private transactionCapabilityChecked = false;

  private transactionsSupported = true;

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<Transaction>,
    @InjectConnection() private readonly connection: Connection,
    private readonly configService: ConfigService,
    private readonly paymentProviderManager: PaymentProviderManager,
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

    return {
      ...wallet,
      id: user.id,
      _id: user.id,
      userId: user.id,
      availableBalance: Math.max(wallet.balance - wallet.frozenBalance, 0),
      pendingBalance,
      totalDeposited: wallet.lifetimeDeposit,
      totalAdjusted,
      transactionCount,
      currency,
      lastTransactionAt: latestTransaction?.createdAt,
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

  async getDepositRequest(
    userId: string,
    transactionId: string,
  ): Promise<TransactionDocument> {
    const transaction = await this.transactionModel
      .findById(transactionId)
      .exec();
    if (!transaction) {
      throw new NotFoundException('Deposit request not found');
    }

    if (transaction.userId.toString() !== userId) {
      throw new NotFoundException('Deposit request not found');
    }

    if (transaction.type !== TransactionType.DEPOSIT) {
      throw new BadRequestException('Transaction is not a deposit request');
    }

    return transaction;
  }

  async cancelDepositRequest(
    userId: string,
    transactionId: string,
    reason?: string,
  ): Promise<TransactionDocument> {
    return this.executeInTransaction(async (session) => {
      const transaction = await this.transactionModel
        .findById(transactionId)
        .session(session)
        .exec();
      if (!transaction) {
        throw new NotFoundException('Deposit request not found');
      }

      if (transaction.userId.toString() !== userId) {
        throw new NotFoundException('Deposit request not found');
      }

      if (transaction.type !== TransactionType.DEPOSIT) {
        throw new BadRequestException('Transaction is not a deposit request');
      }

      if (transaction.status === TransactionStatus.COMPLETED) {
        throw new ConflictException('Deposit has already been completed');
      }

      if (transaction.status === TransactionStatus.FAILED) {
        return transaction;
      }

      const cancelResult =
        await this.paymentProviderManager.cancelPaymentIntent(
          transaction.externalPayment?.provider ??
            ExternalPaymentProvider.PAYOS,
          {
            externalId: transaction.externalPayment?.externalId,
            paymentLinkId: transaction.externalPayment?.paymentLinkId,
            reason,
          },
        );

      transaction.status = TransactionStatus.FAILED;
      transaction.failedAt = new Date();
      transaction.failureReason =
        reason || cancelResult.message || 'Payment cancelled by user';
      transaction.metadata = {
        ...(transaction.metadata ?? {}),
        providerCancelPayload: cancelResult.providerPayload,
      } as never;

      await transaction.save({ session });
      return transaction;
    });
  }

  async createDepositRequest(
    userId: string,
    payload: CreateDepositDto,
    context: DepositCustomerContext = {},
  ): Promise<{
    transaction: TransactionDocument;
    paymentUrl: string;
    externalId: string;
    provider: ExternalPaymentProvider;
    qrCode?: string;
    qrCodeUrl?: string;
  }> {
    const coinAmount = payload.coinAmount ?? payload.amount;
    if (!coinAmount || !Number.isFinite(coinAmount) || coinAmount <= 0) {
      throw new BadRequestException('coinAmount (or amount) must be positive');
    }

    const existing = await this.findExistingTransactionByIdempotencyKey(
      payload.idempotencyKey,
      TransactionType.DEPOSIT,
      userId,
    );
    if (existing) {
      return this.buildDepositRequestResponse(existing);
    }

    const user = await this.findUserOrFail(userId);
    const wallet = this.normalizeWallet(user.wallet);
    const amountReal = payload.amountReal ?? coinAmount;
    const currency = (payload.currency ?? 'VND').toUpperCase();
    const amountWindow = this.configService.get<number>(
      'wallet.depositFraudWindowMinutes',
    );
    const fraudThreshold = this.configService.get<number>(
      'wallet.depositFraudThreshold',
    );
    const pendingSince = new Date(
      Date.now() - (amountWindow ?? 15) * 60 * 1000,
    );
    const pendingSameIpCount = context.ip
      ? await this.transactionModel.countDocuments({
          userId: new Types.ObjectId(userId),
          type: TransactionType.DEPOSIT,
          status: TransactionStatus.PENDING,
          ip: context.ip,
          createdAt: { $gte: pendingSince },
        })
      : 0;
    const flagged = pendingSameIpCount >= (fraudThreshold ?? 3);
    const flagReason = flagged
      ? `Too many pending deposits from IP ${context.ip ?? 'unknown'} within ${amountWindow ?? 15} minutes`
      : undefined;

    const provider = ExternalPaymentProvider.PAYOS;
    const providerIntent =
      await this.paymentProviderManager.createPaymentIntent({
        provider,
        transactionId: this.buildDepositTransactionId(userId),
        userId,
        coinAmount,
        amountReal,
        currency,
        description: payload.description,
        returnUrl: undefined,
        notifyUrl: undefined,
        idempotencyKey: payload.idempotencyKey,
        context,
      });
    const orderCode =
      providerIntent.orderCode ??
      this.tryParseOrderCode(providerIntent.externalId);

    try {
      const transaction = await this.executeInTransaction(async (session) => {
        const pendingTransaction = await this.transactionModel.create(
          [
            {
              userId: new Types.ObjectId(userId),
              type: TransactionType.DEPOSIT,
              amount: coinAmount,
              balanceBefore: wallet.balance,
              balanceAfter: wallet.balance,
              status: TransactionStatus.PENDING,
              description: payload.description || `Deposit ${coinAmount} coins`,
              ip: context.ip,
              userAgent: context.userAgent,
              externalPayment: {
                provider,
                externalId: providerIntent.externalId,
                orderCode,
                amountReal,
                currency,
                exchangeRate: payload.exchangeRate,
                checkoutUrl: providerIntent.checkoutUrl,
                paymentLinkId: providerIntent.paymentLinkId,
                providerPayload: providerIntent.providerPayload,
              },
              metadata: {
                requestId: context.requestId,
                ip: context.ip,
                userAgent: context.userAgent,
                fingerprint: context.fingerprint,
                providerPayload: providerIntent.providerPayload,
                fraud: {
                  pendingSameIpCount,
                  threshold: fraudThreshold ?? 3,
                  windowMinutes: amountWindow ?? 15,
                },
              },
              flagged,
              flagReason,
              idempotencyKey: payload.idempotencyKey,
            },
          ],
          { session },
        );

        return pendingTransaction[0];
      });

      return this.buildDepositRequestResponse(transaction);
    } catch (error) {
      if (this.isDuplicateIdempotencyKeyError(error)) {
        const recovered = await this.findExistingTransactionByIdempotencyKey(
          payload.idempotencyKey,
          TransactionType.DEPOSIT,
          userId,
        );
        if (recovered) {
          return this.buildDepositRequestResponse(recovered);
        }

        const reused = payload.idempotencyKey
          ? await this.findTransactionByIdempotencyKey(payload.idempotencyKey)
          : null;
        if (reused) {
          throw new ConflictException(
            'A transaction with the same idempotency key already exists',
          );
        }

        throw new ConflictException(
          'A deposit request with the same idempotency key already exists',
        );
      }

      throw error;
    }
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

  async adminAdjust(
    actorUserId: string,
    dto: AdminAdjustWalletDto,
    session?: ClientSession,
  ): Promise<TransactionDocument> {
    return this.executeInTransaction(async (activeSession) => {
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
        dto.credit ?? (dto.direction ? dto.direction === 'credit' : undefined);
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
    }, session);
  }

  async finalizeDepositFromCallback(
    callback: PaymentCallbackResult,
  ): Promise<TransactionDocument> {
    if (!callback.signatureValid) {
      throw new BadRequestException('Invalid payment signature');
    }

    switch (callback.paymentStatus) {
      case 'completed':
        return this.markDepositCompleted(callback);
      case 'failed':
        return this.markDepositFailed(callback);
      default:
        return this.markDepositPending(callback);
    }
  }

  async markDepositCompleted(
    callback: PaymentCallbackResult,
  ): Promise<TransactionDocument> {
    return this.executeInTransaction(async (session) => {
      const transaction = await this.findDepositTransactionByExternalId(
        callback.provider,
        callback.externalId,
        session,
      );

      if (transaction.status === TransactionStatus.COMPLETED) {
        return transaction;
      }

      if (transaction.status === TransactionStatus.FAILED) {
        throw new ConflictException('Deposit has already been marked failed');
      }

      this.validateDepositAmount(transaction, callback);

      const user = await this.findUserOrFail(
        transaction.userId.toString(),
        session,
      );
      const wallet = this.normalizeWallet(user.wallet);
      const updatedBalance = wallet.balance + transaction.amount;

      user.wallet = {
        ...wallet,
        balance: updatedBalance,
        lifetimeDeposit: wallet.lifetimeDeposit + transaction.amount,
      };

      transaction.balanceBefore = wallet.balance;
      transaction.balanceAfter = updatedBalance;
      transaction.status = TransactionStatus.COMPLETED;
      transaction.completedAt = new Date();
      transaction.failedAt = undefined;
      transaction.failureReason = undefined;
      transaction.externalPayment = {
        ...(transaction.externalPayment ?? {
          provider: callback.provider,
          externalId: callback.externalId ?? transaction.id,
        }),
        provider: callback.provider,
        externalId:
          callback.externalId ??
          transaction.externalPayment?.externalId ??
          transaction.id,
        providerPayload: callback.rawPayload,
      };
      transaction.metadata = {
        ...(transaction.metadata ?? {}),
        providerPayload: callback.rawPayload,
      } as never;
      transaction.flagged = transaction.flagged || !callback.signatureValid;

      await Promise.all([
        user.save({ session }),
        transaction.save({ session }),
      ]);
      return transaction;
    });
  }

  async markDepositFailed(
    callback: PaymentCallbackResult,
  ): Promise<TransactionDocument> {
    return this.executeInTransaction(async (session) => {
      const transaction = await this.findDepositTransactionByExternalId(
        callback.provider,
        callback.externalId,
        session,
      );

      if (transaction.status === TransactionStatus.FAILED) {
        return transaction;
      }

      if (transaction.status === TransactionStatus.COMPLETED) {
        throw new ConflictException('Deposit has already been completed');
      }

      transaction.status = TransactionStatus.FAILED;
      transaction.failedAt = new Date();
      transaction.failureReason =
        callback.message || callback.transactionStatusCode || 'Payment failed';
      transaction.metadata = {
        ...(transaction.metadata ?? {}),
        providerPayload: callback.rawPayload,
      } as never;
      transaction.externalPayment = {
        ...(transaction.externalPayment ?? {
          provider: callback.provider,
          externalId: callback.externalId ?? transaction.id,
        }),
        provider: callback.provider,
        externalId:
          callback.externalId ??
          transaction.externalPayment?.externalId ??
          transaction.id,
        providerPayload: callback.rawPayload,
      };

      await transaction.save({ session });
      return transaction;
    });
  }

  async markDepositPending(
    callback: PaymentCallbackResult,
  ): Promise<TransactionDocument> {
    const transaction = await this.findDepositTransactionByExternalId(
      callback.provider,
      callback.externalId,
    );
    return transaction;
  }

  async handleProviderCallback(
    provider: ExternalPaymentProvider,
    payload: Record<string, unknown>,
    signature?: string,
  ): Promise<TransactionDocument> {
    const callback = this.paymentProviderManager.verifyCallback(
      provider,
      payload,
      signature,
    );
    return this.finalizeDepositFromCallback(callback);
  }

  async handlePayosWebhook(
    payload: Record<string, unknown>,
    signature?: string,
  ): Promise<{
    code: string;
    message: string;
    transaction?: TransactionDocument;
  }> {
    const callback = this.paymentProviderManager.verifyCallback(
      ExternalPaymentProvider.PAYOS,
      payload,
      signature,
    );

    if (!callback.signatureValid) {
      return { code: '97', message: 'Invalid signature' };
    }

    try {
      const transaction = await this.finalizeDepositFromCallback(callback);
      return { code: '00', message: 'Success', transaction };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException ||
        error instanceof BadRequestException
      ) {
        return { code: '00', message: 'Acknowledged' };
      }

      throw error;
    }
  }

  async syncPayosReturnStatus(payload: {
    orderCode?: string | number;
    paymentLinkId?: string;
    status?: string;
    cancel?: string | boolean;
    code?: string;
    id?: string;
    [key: string]: unknown;
  }): Promise<{
    code: string;
    message: string;
    transaction?: TransactionDocument;
  }> {
    const orderCode = this.normalizeOrderCode(payload.orderCode);
    if (!orderCode) {
      return { code: '00', message: 'Acknowledged' };
    }

    const status = (payload.status ?? '').trim().toUpperCase();
    const canceled =
      this.parseBooleanFlag(payload.cancel) ||
      ['CANCELLED', 'CANCELED', 'FAILED', 'EXPIRED'].includes(status);
    if (!canceled) {
      return { code: '00', message: 'Acknowledged' };
    }

    const paymentLinkId = (payload.paymentLinkId ?? payload.id ?? '')
      .toString()
      .trim();
    const query: Record<string, unknown> = {
      type: TransactionType.DEPOSIT,
      'externalPayment.provider': ExternalPaymentProvider.PAYOS,
      'externalPayment.externalId': orderCode,
    };
    if (paymentLinkId) {
      query['externalPayment.paymentLinkId'] = paymentLinkId;
    }

    return this.executeInTransaction(async (session) => {
      const transaction = await this.transactionModel
        .findOne(query)
        .session(session)
        .exec();
      if (!transaction) {
        return { code: '00', message: 'Acknowledged' };
      }

      if (transaction.status === TransactionStatus.COMPLETED) {
        return { code: '00', message: 'Acknowledged', transaction };
      }

      if (transaction.status !== TransactionStatus.FAILED) {
        transaction.status = TransactionStatus.FAILED;
        transaction.failedAt = new Date();
        transaction.failureReason = status || 'Payment cancelled by user';
      }
      transaction.metadata = {
        ...(transaction.metadata ?? {}),
        providerReturnPayload: payload,
      } as never;

      await transaction.save({ session });
      return { code: '00', message: 'Success', transaction };
    });
  }

  async getPayosReturnStatus(payload: {
    orderCode?: string | number;
    paymentLinkId?: string;
    id?: string;
    status?: string;
    cancel?: string | boolean;
    code?: string;
    [key: string]: unknown;
  }): Promise<PayosReturnStatusPayload> {
    const orderCode = this.normalizeOrderCode(payload.orderCode);
    const paymentLinkId = this.normalizeOrderCode(
      payload.paymentLinkId ?? payload.id,
    );
    const statusHint = (payload.status ?? '').toString().trim().toUpperCase();
    const codeHint = (payload.code ?? '').toString().trim().toUpperCase();
    const cancelHint =
      this.parseBooleanFlag(payload.cancel) ||
      ['CANCELLED', 'CANCELED'].includes(statusHint);
    const failedHint = ['FAILED', 'EXPIRED'].includes(statusHint);
    const pendingHint = ['PENDING', 'PROCESSING'].includes(statusHint);
    const paidHint = ['PAID', 'SUCCESS', 'SUCCEEDED'].includes(statusHint);
    const fallbackStatus = this.resolvePayosUiStatusFromHints({
      cancelHint,
      failedHint,
      pendingHint,
      paidHint,
      codeHint,
    });

    if (!orderCode && !paymentLinkId) {
      return {
        provider: ExternalPaymentProvider.PAYOS,
        status: fallbackStatus,
        message: this.getPayosUiStatusMessage(fallbackStatus),
        hints: {
          status: statusHint || undefined,
          code: codeHint || undefined,
          cancel: cancelHint,
        },
      };
    }

    const query: Record<string, unknown> = {
      type: TransactionType.DEPOSIT,
      'externalPayment.provider': ExternalPaymentProvider.PAYOS,
    };
    if (orderCode) {
      query['externalPayment.externalId'] = orderCode;
    }
    if (paymentLinkId) {
      query['externalPayment.paymentLinkId'] = paymentLinkId;
    }

    const transaction = await this.transactionModel.findOne(query).exec();
    if (!transaction) {
      return {
        provider: ExternalPaymentProvider.PAYOS,
        status: fallbackStatus,
        message: this.getPayosUiStatusMessage(fallbackStatus),
        hints: {
          status: statusHint || undefined,
          code: codeHint || undefined,
          cancel: cancelHint,
        },
      };
    }

    const resolvedStatus = this.resolvePayosUiStatusFromTransaction(
      transaction,
      {
        cancelHint,
        failedHint,
        pendingHint,
        paidHint,
        codeHint,
      },
    );
    const amountReal =
      transaction.externalPayment?.amountReal ?? transaction.amount;
    const currency = transaction.externalPayment?.currency ?? 'VND';
    const exchangeRate =
      transaction.externalPayment?.exchangeRate ??
      (transaction.amount > 0 && amountReal > 0
        ? amountReal / transaction.amount
        : 1);

    return {
      provider: ExternalPaymentProvider.PAYOS,
      status: resolvedStatus,
      message: this.getPayosUiStatusMessage(resolvedStatus),
      hints: {
        status: statusHint || undefined,
        code: codeHint || undefined,
        cancel: cancelHint,
      },
      transaction: {
        id: transaction.id,
        type: transaction.type,
        status: transaction.status,
        amountReal,
        currency,
        coinAmount: transaction.amount,
        paymentMethod: 'QR bank transfer',
        provider: ExternalPaymentProvider.PAYOS,
        orderCode:
          this.normalizeOrderCode(transaction.externalPayment?.orderCode) ??
          this.normalizeOrderCode(transaction.externalPayment?.externalId),
        paymentLinkId: transaction.externalPayment?.paymentLinkId,
        checkoutUrl: transaction.externalPayment?.checkoutUrl,
        createdAt: transaction.createdAt,
        confirmedAt: transaction.completedAt,
        failedAt: transaction.failedAt,
        balanceBefore: transaction.balanceBefore,
        balanceAfter: transaction.balanceAfter,
        failureReason: transaction.failureReason,
      },
      walletTopup: {
        coinAmount: transaction.amount,
        amountReal,
        currency,
        exchangeRate,
        balanceBefore: transaction.balanceBefore,
        balanceAfter: transaction.balanceAfter,
        walletTransactionId: transaction.id,
        note:
          transaction.status === TransactionStatus.COMPLETED
            ? 'Coins have been added to your wallet.'
            : 'Wallet balance will update after payment confirmation.',
      },
    };
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
      ].includes(type)
        ? wallet.totalSpent + Math.abs(delta)
        : wallet.totalSpent,
      totalEarned:
        [TransactionType.POST_REWARD, TransactionType.REFUND_BUYER].includes(
          type,
        ) && delta > 0
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

  private async executeInTransaction<T>(
    callback: (session: ClientSession) => Promise<T>,
    session?: ClientSession,
  ): Promise<T> {
    if (session) {
      return callback(session);
    }

    const startedSession = await this.connection.startSession();
    try {
      const shouldUseTransactions = await this.canUseTransactions();
      if (shouldUseTransactions) {
        try {
          let result!: T;
          await startedSession.withTransaction(async () => {
            result = await callback(startedSession);
          });
          return result;
        } catch (error) {
          if (!this.isTransactionUnsupportedError(error)) {
            throw error;
          }

          this.transactionsSupported = false;
        }
      }

      return await callback(startedSession);
    } finally {
      await startedSession.endSession();
    }
  }

  private async canUseTransactions(): Promise<boolean> {
    if (this.transactionCapabilityChecked) {
      return this.transactionsSupported;
    }

    try {
      const db = this.connection.db;
      if (!db) {
        throw new Error('MongoDB connection is not ready');
      }

      const hello = await db.admin().command({ hello: 1 });
      const isReplicaSetMember = Boolean(hello?.setName);
      const isMongos = hello?.msg === 'isdbgrid';
      this.transactionsSupported = isReplicaSetMember || isMongos;
    } catch {
      // If topology probe fails, keep optimistic default and let runtime decide.
      this.transactionsSupported = true;
    } finally {
      this.transactionCapabilityChecked = true;
    }

    return this.transactionsSupported;
  }

  private isTransactionUnsupportedError(error: unknown): boolean {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : '';

    if (
      message.includes(
        'Transaction numbers are only allowed on a replica set member or mongos',
      )
    ) {
      return true;
    }

    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? (error as { code?: unknown }).code
        : undefined;

    return code === 20;
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

  private async findDepositTransactionByExternalId(
    provider: ExternalPaymentProvider,
    externalId?: string,
    session?: ClientSession,
  ): Promise<TransactionDocument> {
    if (!externalId) {
      throw new BadRequestException('Missing payment reference');
    }

    const query = this.transactionModel.findOne({
      'externalPayment.provider': provider,
      'externalPayment.externalId': externalId,
      type: TransactionType.DEPOSIT,
    });
    if (session) {
      query.session(session);
    }

    const transaction = await query.exec();
    if (!transaction) {
      throw new NotFoundException('Deposit request not found');
    }

    return transaction;
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

  private buildDepositRequestResponse(transaction: TransactionDocument): {
    transaction: TransactionDocument;
    paymentUrl: string;
    externalId: string;
    provider: ExternalPaymentProvider;
    qrCode?: string;
    qrCodeUrl?: string;
  } {
    return {
      transaction,
      paymentUrl: this.resolveDepositPaymentUrl(transaction),
      externalId: transaction.externalPayment?.externalId ?? transaction.id,
      provider:
        transaction.externalPayment?.provider ?? ExternalPaymentProvider.PAYOS,
      qrCode: this.tryReadQrFromTransaction(transaction),
      qrCodeUrl: undefined,
    };
  }

  private resolveDepositPaymentUrl(transaction: TransactionDocument): string {
    if (transaction.externalPayment?.checkoutUrl) {
      return transaction.externalPayment.checkoutUrl;
    }

    const paymentLinkId = transaction.externalPayment?.paymentLinkId;
    if (!paymentLinkId) {
      return '';
    }

    const paymentBaseUrl =
      this.configService.get<string>('wallet.providers.payos.paymentBaseUrl') ||
      'https://pay.payos.vn/web';

    return `${paymentBaseUrl.replace(/\/$/, '')}/${paymentLinkId}`;
  }

  private validateDepositAmount(
    transaction: TransactionDocument,
    callback: PaymentCallbackResult,
  ): void {
    if (
      callback.amountReal !== undefined &&
      transaction.externalPayment?.amountReal !== undefined &&
      callback.amountReal !== transaction.externalPayment.amountReal
    ) {
      throw new ConflictException('Deposit amount does not match request');
    }
  }

  private buildDepositTransactionId(userId: string): string {
    return `deposit-${userId}-${Date.now()}`;
  }

  private normalizeOrderCode(
    value: string | number | undefined,
  ): string | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    const normalized = value.toString().trim();
    return normalized ? normalized : undefined;
  }

  private resolvePayosUiStatusFromHints(hints: {
    cancelHint: boolean;
    failedHint: boolean;
    pendingHint: boolean;
    paidHint: boolean;
    codeHint: string;
  }): PayosReturnUiStatus {
    if (hints.cancelHint) {
      return 'cancelled';
    }

    if (hints.failedHint) {
      return 'failed';
    }

    if (hints.pendingHint) {
      return 'pending';
    }

    if (hints.paidHint || hints.codeHint === '00') {
      return 'verifying';
    }

    return 'unknown';
  }

  private resolvePayosUiStatusFromTransaction(
    transaction: TransactionDocument,
    hints: {
      cancelHint: boolean;
      failedHint: boolean;
      pendingHint: boolean;
      paidHint: boolean;
      codeHint: string;
    },
  ): PayosReturnUiStatus {
    if (transaction.status === TransactionStatus.COMPLETED) {
      return 'success';
    }

    if (transaction.status === TransactionStatus.FAILED) {
      if (
        hints.cancelHint ||
        this.isCancellationFailureReason(transaction.failureReason)
      ) {
        return 'cancelled';
      }

      return 'failed';
    }

    if (transaction.status === TransactionStatus.PENDING) {
      if (hints.cancelHint) {
        return 'cancelled';
      }

      if (hints.pendingHint) {
        return 'pending';
      }

      if (hints.paidHint || hints.codeHint === '00') {
        return 'verifying';
      }

      return 'pending';
    }

    return 'unknown';
  }

  private getPayosUiStatusMessage(status: PayosReturnUiStatus): string {
    if (status === 'success') {
      return 'Payment has been confirmed and your wallet has been updated.';
    }

    if (status === 'pending') {
      return 'You returned to the site, but payment confirmation is still pending.';
    }

    if (status === 'failed') {
      return 'Payment was not completed. Please try again or use another method.';
    }

    if (status === 'cancelled') {
      return 'Payment was canceled. You can create a new deposit request anytime.';
    }

    if (status === 'verifying') {
      return 'Redirect received. We are verifying your payment with the system.';
    }

    return 'We could not determine the final payment state yet.';
  }

  private isCancellationFailureReason(reason?: string): boolean {
    if (!reason) {
      return false;
    }

    const normalized = reason.trim().toLowerCase();
    return normalized.includes('cancel');
  }

  private parseBooleanFlag(value: string | boolean | undefined): boolean {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value !== 'string') {
      return false;
    }

    const normalized = value.trim().toLowerCase();
    return ['1', 'true', 'yes', 'y'].includes(normalized);
  }

  private tryReadQrFromTransaction(
    transaction: TransactionDocument,
  ): string | undefined {
    const payload =
      transaction.externalPayment?.providerPayload ??
      transaction.metadata?.providerPayload;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return undefined;
    }

    const createResponse = payload.createResponse;
    if (
      !createResponse ||
      typeof createResponse !== 'object' ||
      Array.isArray(createResponse)
    ) {
      return undefined;
    }

    const responseData = (createResponse as Record<string, unknown>).data;
    if (
      !responseData ||
      typeof responseData !== 'object' ||
      Array.isArray(responseData)
    ) {
      return undefined;
    }

    const qrCode = (responseData as Record<string, unknown>).qrCode;
    return typeof qrCode === 'string' && qrCode.trim()
      ? qrCode.trim()
      : undefined;
  }

  private tryParseOrderCode(value: string | undefined): number | undefined {
    if (!value) {
      return undefined;
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return undefined;
    }

    return parsed;
  }
}
