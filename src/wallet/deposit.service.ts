import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { OpsAlertService } from '../alerts/ops-alert.service';
import { MongoTransactionService } from '../common/services/mongo-transaction.service';
import { User, UserDocument } from '../users/schemas/user.schema';
import { CreateDepositDto } from './dto/create-deposit.dto';
import {
  DepositCustomerContext,
  PaymentCallbackResult,
} from './providers/payment-provider.interface';
import { PaymentProviderManager } from './providers/payment-provider.manager';
import {
  ExternalPaymentProvider,
  Transaction,
  TransactionDocument,
  TransactionStatus,
  TransactionType,
} from './schemas/transaction.schema';
import { createDefaultWallet, WalletState } from './schemas/wallet.schema';

export type DepositRequestResponse = {
  transaction: TransactionDocument;
  paymentUrl: string;
  externalId: string;
  provider: ExternalPaymentProvider;
  qrCode?: string;
  qrCodeUrl?: string;
};

@Injectable()
export class DepositService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<Transaction>,
    @InjectConnection() private readonly connection: Connection,
    private readonly configService: ConfigService,
    private readonly paymentProviderManager: PaymentProviderManager,
    private readonly mongoTransactionService: MongoTransactionService,
    @Optional() private readonly opsAlertService?: OpsAlertService,
  ) {}

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
  ): Promise<DepositRequestResponse> {
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
    try {
      const transaction = await this.finalizeDepositFromCallback(callback);
      if (provider === ExternalPaymentProvider.PAYOS) {
        this.opsAlertService?.recordWebhookResult({
          success: true,
          provider,
        });
      }
      return transaction;
    } catch (error) {
      if (provider === ExternalPaymentProvider.PAYOS) {
        this.opsAlertService?.recordWebhookResult({
          success: false,
          reason: error instanceof Error ? error.message : 'unknown_error',
          provider,
        });
      }
      throw error;
    }
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
      this.opsAlertService?.recordWebhookResult({
        success: false,
        reason: 'invalid_signature',
        provider: ExternalPaymentProvider.PAYOS,
      });
      return { code: '97', message: 'Invalid signature' };
    }

    try {
      const transaction = await this.finalizeDepositFromCallback(callback);
      this.opsAlertService?.recordWebhookResult({
        success: true,
        provider: ExternalPaymentProvider.PAYOS,
      });
      return { code: '00', message: 'Success', transaction };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException ||
        error instanceof BadRequestException
      ) {
        this.opsAlertService?.recordWebhookResult({
          success: false,
          reason: error.message,
          provider: ExternalPaymentProvider.PAYOS,
        });
        return { code: '00', message: 'Acknowledged' };
      }

      this.opsAlertService?.recordWebhookResult({
        success: false,
        reason: error instanceof Error ? error.message : 'unknown_error',
        provider: ExternalPaymentProvider.PAYOS,
      });
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

  private buildDepositRequestResponse(
    transaction: TransactionDocument,
  ): DepositRequestResponse {
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
