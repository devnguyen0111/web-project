import { Injectable, Logger } from '@nestjs/common';
import { ExternalPaymentProvider } from '../wallet/schemas/transaction.schema';

type HealthReadinessChecks = {
  mongodb: 'ok' | 'degraded';
  payosConfig: 'ok' | 'degraded';
  appConfig: 'ok' | 'degraded';
};

type RenewalResultInput = {
  success: boolean;
  reason?: string;
};

type WebhookResultInput = {
  success: boolean;
  reason?: string;
  provider?: ExternalPaymentProvider;
};

@Injectable()
export class OpsAlertService {
  private readonly logger = new Logger(OpsAlertService.name);

  recordHealthReadiness(
    status: 'ok' | 'degraded',
    checks: HealthReadinessChecks,
  ) {
    if (status === 'ok') {
      this.logger.debug(
        `health_readiness_ok mongodb=${checks.mongodb} payosConfig=${checks.payosConfig} appConfig=${checks.appConfig}`,
      );
      return;
    }

    this.logger.warn(
      `health_readiness_degraded mongodb=${checks.mongodb} payosConfig=${checks.payosConfig} appConfig=${checks.appConfig}`,
    );
  }

  recordWebhookResult(input: WebhookResultInput) {
    const provider = input.provider ?? ExternalPaymentProvider.PAYOS;
    if (input.success) {
      this.logger.log(`payment_webhook_success provider=${provider}`);
      return;
    }

    this.logger.warn(
      `payment_webhook_failed provider=${provider} reason=${input.reason ?? 'unknown'}`,
    );
  }

  recordRenewalResult(input: RenewalResultInput) {
    if (input.success) {
      this.logger.log('subscription_renewal_success');
      return;
    }

    this.logger.warn(
      `subscription_renewal_failed reason=${input.reason ?? 'unknown'}`,
    );
  }
}
