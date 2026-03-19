import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExternalPaymentProvider } from '../schemas/transaction.schema';
import {
  hmacSha256,
  normalizeUrl,
  toPlainObject,
} from './payment-provider.utils';
import {
  DepositPaymentRequest,
  PaymentCallbackResult,
  PaymentCancelResult,
  PaymentIntentResult,
  PaymentProviderStrategy,
} from './payment-provider.interface';

type PayosCreatePaymentResponse = {
  code?: string;
  desc?: string;
  data?: {
    orderCode?: number;
    paymentLinkId?: string;
    checkoutUrl?: string;
    qrCode?: string;
    amount?: number;
    status?: string;
    [key: string]: unknown;
  };
  signature?: string;
  [key: string]: unknown;
};

type PayosCancelPaymentResponse = {
  code?: string;
  desc?: string;
  data?: {
    status?: string;
    cancellationReason?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

@Injectable()
export class PayosProvider implements PaymentProviderStrategy {
  readonly provider = ExternalPaymentProvider.PAYOS as const;

  constructor(private readonly configService: ConfigService) {}

  async createPaymentIntent(
    request: DepositPaymentRequest,
  ): Promise<PaymentIntentResult> {
    const config = this.configService.get<{
      clientId?: string;
      apiKey?: string;
      checksumKey?: string;
      partnerCode?: string;
      endpoint?: string;
      paymentBaseUrl?: string;
      returnUrl?: string;
      cancelUrl?: string;
      webhookUrl?: string;
      currency?: string;
    }>('wallet.providers.payos');

    const clientId = config?.clientId?.trim() || '';
    const apiKey = config?.apiKey?.trim() || '';
    const checksumKey = config?.checksumKey?.trim() || '';
    const partnerCode = config?.partnerCode?.trim() || '';
    const endpoint =
      normalizeUrl(config?.endpoint) ||
      'https://api-merchant.payos.vn/v2/payment-requests';
    const paymentBaseUrl =
      normalizeUrl(config?.paymentBaseUrl) || 'https://pay.payos.vn/web';
    const returnUrl =
      request.returnUrl ||
      normalizeUrl(config?.returnUrl) ||
      'http://localhost:3000/wallet/payment-result';
    const cancelUrl = normalizeUrl(config?.cancelUrl) || returnUrl;
    const webhookUrl =
      request.notifyUrl || normalizeUrl(config?.webhookUrl) || undefined;
    const currency = (
      config?.currency ||
      request.currency ||
      'VND'
    ).toUpperCase();

    if (!clientId || !apiKey || !checksumKey) {
      throw new BadRequestException(
        'PayOS is not configured. Set PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY.',
      );
    }

    const amount = request.amountReal;
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new BadRequestException(
        'PayOS amount must be a positive integer (VND).',
      );
    }

    const orderCode = this.generateOrderCode();
    const description = this.normalizeDescription(
      request.description,
      orderCode,
    );
    const signatureData = this.buildCreateSignatureData({
      amount,
      cancelUrl,
      description,
      orderCode,
      returnUrl,
    });
    const signature = hmacSha256(checksumKey, signatureData);

    const requestBody: Record<string, unknown> = {
      orderCode,
      amount,
      description,
      items: [
        {
          name: 'Coin top-up',
          quantity: 1,
          price: amount,
        },
      ],
      cancelUrl,
      returnUrl,
      signature,
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': clientId,
        'x-api-key': apiKey,
        ...(partnerCode ? { 'x-partner-code': partnerCode } : {}),
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    let parsed: PayosCreatePaymentResponse;
    try {
      parsed = JSON.parse(responseText) as PayosCreatePaymentResponse;
    } catch {
      throw new BadRequestException(
        `PayOS create payment failed: invalid response (${response.status}).`,
      );
    }

    if (!response.ok || parsed.code !== '00' || !parsed.data?.checkoutUrl) {
      throw new BadRequestException(
        `PayOS create payment failed (${parsed.code ?? response.status}): ${parsed.desc ?? 'unknown error'}`,
      );
    }

    const resolvedOrderCode = parsed.data.orderCode ?? orderCode;
    const checkoutUrl =
      parsed.data.checkoutUrl ||
      `${paymentBaseUrl}/${parsed.data.paymentLinkId ?? ''}`;

    return {
      externalId: String(resolvedOrderCode),
      paymentUrl: checkoutUrl,
      orderCode: resolvedOrderCode,
      qrCode: parsed.data.qrCode,
      paymentLinkId: parsed.data.paymentLinkId,
      checkoutUrl,
      providerPayload: {
        createRequest: requestBody,
        createResponse: parsed,
        currency,
        webhookUrl,
      },
    };
  }

  verifyCallback(
    payload: Record<string, unknown>,
    signature?: string,
  ): PaymentCallbackResult {
    const config = this.configService.get<{
      checksumKey?: string;
      currency?: string;
    }>('wallet.providers.payos');
    const checksumKey = config?.checksumKey?.trim() || '';
    const plainPayload = toPlainObject(payload);
    const data = this.readObject(plainPayload, ['data']) ?? {};
    const callbackSignature =
      signature || this.readString(plainPayload, ['signature']);
    const signatureValid = this.verifyWebhookSignature(
      data,
      callbackSignature,
      checksumKey,
    );

    const status = this.readString(data, ['status']);
    const rootCode = this.readString(plainPayload, ['code']);
    const dataCode = this.readString(data, ['code']);
    const success = this.readBoolean(plainPayload, ['success']) ?? false;
    const paymentStatus = this.normalizePaymentStatus(
      status,
      rootCode,
      dataCode,
      success,
    );

    return {
      provider: this.provider,
      externalId: this.readString(data, ['orderCode']),
      paymentStatus,
      amountReal: this.readNumber(data, ['amount']),
      currency:
        this.readString(data, ['currency']) ||
        (config?.currency || 'VND').toUpperCase(),
      rawPayload: plainPayload,
      signatureValid,
      transactionStatusCode: status || dataCode || rootCode,
      message:
        this.readString(data, ['desc', 'message']) ||
        this.readString(plainPayload, ['desc', 'message']),
    };
  }

  async cancelPaymentIntent(reference: {
    externalId?: string;
    paymentLinkId?: string;
    reason?: string;
  }): Promise<PaymentCancelResult> {
    const config = this.configService.get<{
      clientId?: string;
      apiKey?: string;
      endpoint?: string;
    }>('wallet.providers.payos');

    const clientId = config?.clientId?.trim() || '';
    const apiKey = config?.apiKey?.trim() || '';
    const endpoint =
      normalizeUrl(config?.endpoint) ||
      'https://api-merchant.payos.vn/v2/payment-requests';
    const paymentLinkId = (reference.paymentLinkId ?? '').trim();
    const externalId = (reference.externalId ?? '').trim();
    const targetId = paymentLinkId || externalId;
    const cancellationReason =
      reference.reason?.trim() || 'Cancelled by user from wallet';

    if (!clientId || !apiKey) {
      throw new BadRequestException(
        'PayOS is not configured. Set PAYOS_CLIENT_ID and PAYOS_API_KEY.',
      );
    }

    if (!targetId) {
      throw new BadRequestException(
        'Missing PayOS payment reference to cancel',
      );
    }

    const response = await fetch(
      `${endpoint}/${encodeURIComponent(targetId)}/cancel`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-id': clientId,
          'x-api-key': apiKey,
        },
        body: JSON.stringify({ cancellationReason }),
      },
    );

    const responseText = await response.text();
    let parsed: PayosCancelPaymentResponse;
    try {
      parsed = JSON.parse(responseText) as PayosCancelPaymentResponse;
    } catch {
      throw new BadRequestException(
        `PayOS cancel payment failed: invalid response (${response.status}).`,
      );
    }

    if (!response.ok || parsed.code !== '00') {
      throw new BadRequestException(
        `PayOS cancel payment failed (${parsed.code ?? response.status}): ${parsed.desc ?? 'unknown error'}`,
      );
    }

    return {
      success: true,
      status: parsed.data?.status,
      message:
        parsed.data?.cancellationReason || parsed.desc || cancellationReason,
      providerPayload: parsed as Record<string, unknown>,
    };
  }

  private normalizeDescription(
    input: string | undefined,
    orderCode: number,
  ): string {
    const base = (input?.trim() || `TOPUP${orderCode}`).replace(/\s+/g, ' ');
    return base.length > 25 ? base.slice(0, 25) : base;
  }

  private buildCreateSignatureData(data: {
    amount: number;
    cancelUrl: string;
    description: string;
    orderCode: number;
    returnUrl: string;
  }): string {
    return [
      `amount=${data.amount}`,
      `cancelUrl=${data.cancelUrl}`,
      `description=${data.description}`,
      `orderCode=${data.orderCode}`,
      `returnUrl=${data.returnUrl}`,
    ].join('&');
  }

  private verifyWebhookSignature(
    data: Record<string, unknown>,
    signature: string | undefined,
    checksumKey: string,
  ): boolean {
    if (!signature || !checksumKey) {
      return false;
    }

    const signatureData = this.buildWebhookSignatureData(data);
    const expectedSignature = hmacSha256(checksumKey, signatureData);
    return expectedSignature === signature;
  }

  private buildWebhookSignatureData(data: Record<string, unknown>): string {
    const sortedData = this.sortObjectByKey(data);
    return Object.keys(sortedData)
      .filter((key) => sortedData[key] !== undefined)
      .map((key) => `${key}=${this.normalizeWebhookValue(sortedData[key])}`)
      .join('&');
  }

  private normalizeWebhookValue(value: unknown): string {
    if (
      value === null ||
      value === undefined ||
      value === 'null' ||
      value === 'undefined'
    ) {
      return '';
    }

    if (Array.isArray(value)) {
      return JSON.stringify(
        value.map((item) =>
          this.isPlainObject(item) ? this.sortObjectByKey(item) : item,
        ),
      );
    }

    if (this.isPlainObject(value)) {
      return JSON.stringify(this.sortObjectByKey(value));
    }

    return String(value);
  }

  private sortObjectByKey(
    object: Record<string, unknown>,
  ): Record<string, unknown> {
    return Object.keys(object)
      .sort()
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = object[key];
        return accumulator;
      }, {});
  }

  private normalizePaymentStatus(
    status: string | undefined,
    rootCode: string | undefined,
    dataCode: string | undefined,
    success: boolean,
  ): 'completed' | 'failed' | 'pending' {
    const normalizedStatus = (status || '').toUpperCase();
    if (normalizedStatus === 'PAID') {
      return 'completed';
    }
    if (['PENDING', 'PROCESSING'].includes(normalizedStatus)) {
      return 'pending';
    }
    if (normalizedStatus === 'CANCELLED') {
      return 'failed';
    }

    if (rootCode === '00' && dataCode === '00' && success) {
      return 'completed';
    }

    return 'failed';
  }

  private generateOrderCode(): number {
    const secondSeed = Math.floor(Date.now() / 1000);
    const entropy = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');
    return Number(`${secondSeed}${entropy}`);
  }

  private readString(
    payload: Record<string, unknown>,
    keys: string[],
  ): string | undefined {
    for (const key of keys) {
      const value = payload[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value.toString();
      }
    }

    return undefined;
  }

  private readBoolean(
    payload: Record<string, unknown>,
    keys: string[],
  ): boolean | undefined {
    for (const key of keys) {
      const value = payload[key];
      if (typeof value === 'boolean') {
        return value;
      }
      if (typeof value === 'string') {
        if (value.toLowerCase() === 'true') {
          return true;
        }
        if (value.toLowerCase() === 'false') {
          return false;
        }
      }
    }

    return undefined;
  }

  private readNumber(
    payload: Record<string, unknown>,
    keys: string[],
  ): number | undefined {
    for (const key of keys) {
      const value = payload[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }

    return undefined;
  }

  private readObject(
    payload: Record<string, unknown>,
    keys: string[],
  ): Record<string, unknown> | undefined {
    for (const key of keys) {
      const value = payload[key];
      if (this.isPlainObject(value)) {
        return value;
      }
    }

    return undefined;
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }
}
