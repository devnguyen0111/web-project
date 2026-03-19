import { BadRequestException, Injectable } from '@nestjs/common';
import { ExternalPaymentProvider } from '../schemas/transaction.schema';
import {
  DepositPaymentRequest,
  PaymentCallbackResult,
  PaymentCancelResult,
  PaymentIntentResult,
  PaymentProviderStrategy,
} from './payment-provider.interface';
import { PayosProvider } from './payos.provider';

@Injectable()
export class PaymentProviderManager {
  private readonly providers: Map<
    ExternalPaymentProvider,
    PaymentProviderStrategy
  >;

  constructor(private readonly payosProvider: PayosProvider) {
    this.providers = new Map<ExternalPaymentProvider, PaymentProviderStrategy>([
      [this.payosProvider.provider, this.payosProvider],
    ]);
  }

  async createPaymentIntent(
    request: DepositPaymentRequest,
  ): Promise<PaymentIntentResult> {
    return this.getProvider(request.provider).createPaymentIntent(request);
  }

  verifyCallback(
    provider: ExternalPaymentProvider,
    payload: Record<string, unknown>,
    signature?: string,
  ): PaymentCallbackResult {
    return this.getProvider(provider).verifyCallback(payload, signature);
  }

  cancelPaymentIntent(
    provider: ExternalPaymentProvider,
    reference: {
      externalId?: string;
      paymentLinkId?: string;
      reason?: string;
    },
  ): Promise<PaymentCancelResult> {
    return this.getProvider(provider).cancelPaymentIntent(reference);
  }

  private getProvider(
    provider: ExternalPaymentProvider,
  ): PaymentProviderStrategy {
    const strategy = this.providers.get(provider);
    if (!strategy) {
      throw new BadRequestException(
        `Unsupported payment provider: ${provider}`,
      );
    }

    return strategy;
  }
}
