import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { MongoTransactionService } from '../common/services/mongo-transaction.service';
import { PaymentProviderManager } from './providers/payment-provider.manager';
import {
  ExternalPaymentProvider,
  Transaction,
  TransactionDocument,
  TransactionStatus,
  TransactionType,
} from './schemas/transaction.schema';

type PayosReturnUiStatus =
  | 'success'
  | 'pending'
  | 'failed'
  | 'cancelled'
  | 'verifying'
  | 'unknown';

export type PayosReturnSyncPayload = {
  orderCode?: string | number;
  paymentLinkId?: string;
  status?: string;
  cancel?: string | boolean;
  code?: string;
  id?: string;
  [key: string]: unknown;
};

export type PayosReturnStatusPayload = {
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
export class PaymentReturnService {
  constructor(
    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<Transaction>,
    @InjectConnection() private readonly connection: Connection,
    private readonly paymentProviderManager: PaymentProviderManager,
    private readonly mongoTransactionService: MongoTransactionService,
  ) {}

  async syncPayosReturnStatus(
    userIdOrPayload: string | PayosReturnSyncPayload,
    payloadOrSignature?: PayosReturnSyncPayload | string,
    signature?: string,
  ): Promise<{
    code: string;
    message: string;
    transaction?: TransactionDocument;
  }> {
    const {
      userId,
      payload,
      signature: resolvedSignature,
    } = this.resolveSyncArgs(userIdOrPayload, payloadOrSignature, signature);
    const signatureResult = this.verifyPayosReturnSignature(
      payload,
      resolvedSignature,
    );
    if (!signatureResult.accepted) {
      return { code: '97', message: signatureResult.reason };
    }

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
    if (userId) {
      query.userId = new Types.ObjectId(userId);
    }
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
    const resolvedUserId =
      typeof userIdOrPayload === 'string' ? userIdOrPayload : undefined;
    const resolvedPayload =
      typeof userIdOrPayload === 'string' ? payload ?? {} : userIdOrPayload;
    const orderCode = this.normalizeOrderCode(resolvedPayload.orderCode);
    const paymentLinkId = this.normalizeOrderCode(
      resolvedPayload.paymentLinkId ?? resolvedPayload.id,
    );
    const statusHint = (resolvedPayload.status ?? '')
      .toString()
      .trim()
      .toUpperCase();
    const codeHint = (resolvedPayload.code ?? '').toString().trim().toUpperCase();
    const cancelHint =
      this.parseBooleanFlag(resolvedPayload.cancel) ||
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
    if (resolvedUserId) {
      query.userId = new Types.ObjectId(resolvedUserId);
    }
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

  private resolveSyncArgs(
    userIdOrPayload: string | PayosReturnSyncPayload,
    payloadOrSignature?: PayosReturnSyncPayload | string,
    signature?: string,
  ): {
    userId?: string;
    payload: PayosReturnSyncPayload;
    signature?: string;
  } {
    if (typeof userIdOrPayload === 'string') {
      return {
        userId: userIdOrPayload,
        payload:
          payloadOrSignature && typeof payloadOrSignature !== 'string'
            ? payloadOrSignature
            : {},
        signature:
          typeof payloadOrSignature === 'string' ? payloadOrSignature : signature,
      };
    }

    return {
      payload: userIdOrPayload,
      signature:
        typeof payloadOrSignature === 'string' ? payloadOrSignature : signature,
    };
  }

  private verifyPayosReturnSignature(
    payload: Record<string, unknown>,
    signature?: string,
  ): { accepted: boolean; reason: string } {
    const normalizedSignature = (signature ?? '').toString().trim();
    if (!normalizedSignature) {
      return { accepted: false, reason: 'Missing payment signature' };
    }

    const callback = this.paymentProviderManager.verifyCallback(
      ExternalPaymentProvider.PAYOS,
      { data: payload },
      normalizedSignature,
    );
    if (!callback.signatureValid) {
      return { accepted: false, reason: 'Invalid payment signature' };
    }

    return { accepted: true, reason: 'Validated' };
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
}
