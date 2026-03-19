import { ExternalPaymentProvider } from '../schemas/transaction.schema';

export interface DepositCustomerContext {
  ip?: string;
  userAgent?: string;
  requestId?: string;
  fingerprint?: string;
}

export interface DepositPaymentRequest {
  provider: ExternalPaymentProvider;
  transactionId: string;
  userId: string;
  coinAmount: number;
  amountReal: number;
  currency: string;
  description?: string;
  returnUrl?: string;
  notifyUrl?: string;
  idempotencyKey?: string;
  context?: DepositCustomerContext;
}

export interface PaymentIntentResult {
  externalId: string;
  paymentUrl: string;
  providerPayload: Record<string, unknown>;
  orderCode?: number;
  qrCode?: string;
  qrCodeUrl?: string;
  paymentLinkId?: string;
  checkoutUrl?: string;
}

export interface PaymentCancelResult {
  success: boolean;
  status?: string;
  message?: string;
  providerPayload?: Record<string, unknown>;
}

export interface PaymentCallbackResult {
  provider: ExternalPaymentProvider;
  externalId?: string;
  paymentStatus: 'completed' | 'failed' | 'pending';
  amountReal?: number;
  currency?: string;
  rawPayload: Record<string, unknown>;
  signatureValid: boolean;
  transactionStatusCode?: string;
  message?: string;
}

export interface PaymentProviderStrategy {
  readonly provider: ExternalPaymentProvider;

  createPaymentIntent(
    request: DepositPaymentRequest,
  ): Promise<PaymentIntentResult>;

  verifyCallback(
    payload: Record<string, unknown>,
    signature?: string,
  ): PaymentCallbackResult;

  cancelPaymentIntent(reference: {
    externalId?: string;
    paymentLinkId?: string;
    reason?: string;
  }): Promise<PaymentCancelResult>;
}
