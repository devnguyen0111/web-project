import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExternalPaymentProvider } from '../schemas/transaction.schema';
import { hmacSha256 } from './payment-provider.utils';
import { PayosProvider } from './payos.provider';

describe('PayosProvider', () => {
  let provider: PayosProvider;
  let configService: { get: jest.Mock };
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as never;
    configService = {
      get: jest.fn().mockReturnValue({
        clientId: 'client-id',
        apiKey: 'api-key',
        checksumKey: 'checksum-key',
        endpoint: 'https://api-merchant.payos.vn/v2/payment-requests',
        paymentBaseUrl: 'https://pay.payos.vn/web',
        returnUrl: 'https://example.com/return',
        cancelUrl: 'https://example.com/cancel',
      }),
    };
    provider = new PayosProvider(configService as unknown as ConfigService);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('creates payment intent and maps PayOS response', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          code: '00',
          data: {
            orderCode: 1234567890,
            paymentLinkId: 'link-1',
            checkoutUrl: 'https://pay.payos.vn/web/link-1',
            qrCode: '000201...',
          },
        }),
    });

    const result = await provider.createPaymentIntent({
      provider: ExternalPaymentProvider.PAYOS,
      transactionId: 'tx-1',
      userId: 'user-1',
      coinAmount: 100,
      amountReal: 100_000,
      currency: 'VND',
      description: 'Wallet top up',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.externalId).toBe('1234567890');
    expect(result.orderCode).toBe(1234567890);
    expect(result.paymentLinkId).toBe('link-1');
    expect(result.checkoutUrl).toBe('https://pay.payos.vn/web/link-1');
    expect(result.qrCode).toBe('000201...');
  });

  it('rejects non-integer amountReal', async () => {
    await expect(
      provider.createPaymentIntent({
        provider: ExternalPaymentProvider.PAYOS,
        transactionId: 'tx-2',
        userId: 'user-2',
        coinAmount: 10,
        amountReal: 10.5,
        currency: 'VND',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('verifies webhook signature and resolves completed status', () => {
    const data = {
      amount: 120000,
      orderCode: 99887766,
      status: 'PAID',
      code: '00',
      currency: 'VND',
    };
    const signaturePayload =
      'amount=120000&code=00&currency=VND&orderCode=99887766&status=PAID';
    const signature = hmacSha256('checksum-key', signaturePayload);

    const result = provider.verifyCallback(
      {
        code: '00',
        success: true,
        data,
        signature,
      },
      undefined,
    );

    expect(result.signatureValid).toBe(true);
    expect(result.paymentStatus).toBe('completed');
    expect(result.externalId).toBe('99887766');
    expect(result.amountReal).toBe(120000);
    expect(result.currency).toBe('VND');
  });

  it('marks callback as invalid when signature does not match', () => {
    const result = provider.verifyCallback(
      {
        code: '00',
        success: true,
        data: {
          amount: 120000,
          orderCode: 99887766,
          status: 'PAID',
        },
        signature: 'invalid-signature',
      },
      undefined,
    );

    expect(result.signatureValid).toBe(false);
    expect(result.paymentStatus).toBe('completed');
  });

  it('cancels payment intent and returns provider payload', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          code: '00',
          desc: 'Success',
          data: {
            status: 'CANCELLED',
            cancellationReason: 'cancelled by user',
          },
        }),
    });

    const result = await provider.cancelPaymentIntent({
      paymentLinkId: 'payment-link-1',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api-merchant.payos.vn/v2/payment-requests/payment-link-1/cancel',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(result.success).toBe(true);
    expect(result.status).toBe('CANCELLED');
    expect(result.message).toBe('cancelled by user');
  });

  it('throws when PayOS returns invalid JSON for cancel request', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 502,
      text: async () => 'not-json',
    });

    await expect(
      provider.cancelPaymentIntent({ paymentLinkId: 'payment-link-2' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
