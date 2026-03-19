import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../mail/mail.service';

type AlertWindowState = {
  startedAt: number;
  total: number;
  failed: number;
};

type HealthStatus = 'ok' | 'degraded';

@Injectable()
export class OpsAlertService {
  private readonly logger = new Logger(OpsAlertService.name);
  private readonly enabled: boolean;
  private readonly owners: string[];
  private readonly cooldownMs: number;
  private readonly webhookWindowMs: number;
  private readonly webhookMinSamples: number;
  private readonly webhookFailureRateThreshold: number;
  private readonly renewalWindowMs: number;
  private readonly renewalMinSamples: number;
  private readonly renewalFailureRateThreshold: number;
  private readonly healthConsecutiveDegradedThreshold: number;
  private readonly lastAlertAt = new Map<string, number>();
  private webhookState: AlertWindowState = {
    startedAt: Date.now(),
    total: 0,
    failed: 0,
  };
  private renewalState: AlertWindowState = {
    startedAt: Date.now(),
    total: 0,
    failed: 0,
  };
  private consecutiveHealthDegraded = 0;

  constructor(
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {
    const env = this.readString('NODE_ENV')?.toLowerCase();
    this.enabled = this.readBoolean('ALERTS_ENABLED', env === 'production');
    this.owners = this.readCsv('ALERT_OWNER_EMAILS');
    this.cooldownMs = this.readDurationMinutes('ALERT_COOLDOWN_MINUTES', 30);

    this.webhookWindowMs = this.readDurationMinutes(
      'ALERT_WEBHOOK_WINDOW_MINUTES',
      15,
    );
    this.webhookMinSamples = this.readPositiveInt(
      'ALERT_WEBHOOK_MIN_SAMPLES',
      20,
    );
    this.webhookFailureRateThreshold = this.readRate(
      'ALERT_WEBHOOK_FAILURE_RATE_THRESHOLD',
      0.2,
    );

    this.renewalWindowMs = this.readDurationMinutes(
      'ALERT_RENEWAL_WINDOW_MINUTES',
      60,
    );
    this.renewalMinSamples = this.readPositiveInt(
      'ALERT_RENEWAL_MIN_SAMPLES',
      10,
    );
    this.renewalFailureRateThreshold = this.readRate(
      'ALERT_RENEWAL_FAILURE_RATE_THRESHOLD',
      0.3,
    );

    this.healthConsecutiveDegradedThreshold = this.readPositiveInt(
      'ALERT_HEALTH_CONSECUTIVE_DEGRADED_THRESHOLD',
      3,
    );
  }

  recordWebhookResult(input: {
    success: boolean;
    reason?: string;
    provider?: string;
  }): void {
    this.rotateWindow(this.webhookState, this.webhookWindowMs);
    this.webhookState.total += 1;
    if (!input.success) {
      this.webhookState.failed += 1;
    }

    if (this.webhookState.total < this.webhookMinSamples) {
      return;
    }

    const failureRate = this.webhookState.failed / this.webhookState.total;
    if (failureRate < this.webhookFailureRateThreshold) {
      return;
    }

    const rateText = (failureRate * 100).toFixed(1);
    const thresholdText = (this.webhookFailureRateThreshold * 100).toFixed(1);
    void this.emitAlert(
      'webhook-failure-rate',
      `Webhook/payment failure rate alert (${input.provider ?? 'unknown'})`,
      [
        `Failure rate=${rateText}% over last ${this.webhookState.total} callbacks (failed=${this.webhookState.failed}).`,
        `Threshold=${thresholdText}% (minSamples=${this.webhookMinSamples}).`,
        input.reason ? `Last failure reason: ${input.reason}` : undefined,
      ]
        .filter(Boolean)
        .join(' '),
    );
  }

  recordRenewalResult(input: { success: boolean; reason?: string }): void {
    this.rotateWindow(this.renewalState, this.renewalWindowMs);
    this.renewalState.total += 1;
    if (!input.success) {
      this.renewalState.failed += 1;
    }

    if (this.renewalState.total < this.renewalMinSamples) {
      return;
    }

    const failureRate = this.renewalState.failed / this.renewalState.total;
    if (failureRate < this.renewalFailureRateThreshold) {
      return;
    }

    const rateText = (failureRate * 100).toFixed(1);
    const thresholdText = (this.renewalFailureRateThreshold * 100).toFixed(1);
    void this.emitAlert(
      'renewal-failure-rate',
      'Subscription renewal failure rate alert',
      [
        `Failure rate=${rateText}% over last ${this.renewalState.total} renewals (failed=${this.renewalState.failed}).`,
        `Threshold=${thresholdText}% (minSamples=${this.renewalMinSamples}).`,
        input.reason ? `Last failure reason: ${input.reason}` : undefined,
      ]
        .filter(Boolean)
        .join(' '),
    );
  }

  recordHealthReadiness(
    status: HealthStatus,
    checks?: Record<string, HealthStatus>,
  ): void {
    if (status === 'ok') {
      this.consecutiveHealthDegraded = 0;
      return;
    }

    this.consecutiveHealthDegraded += 1;
    if (
      this.consecutiveHealthDegraded <
      this.healthConsecutiveDegradedThreshold
    ) {
      return;
    }

    const checkSummary = checks
      ? Object.entries(checks)
          .map(([key, value]) => `${key}=${value}`)
          .join(', ')
      : 'n/a';
    void this.emitAlert(
      'health-degraded',
      'Health readiness degraded',
      `Health readiness degraded for ${this.consecutiveHealthDegraded} consecutive checks. Threshold=${this.healthConsecutiveDegradedThreshold}. Checks: ${checkSummary}.`,
    );
  }

  private rotateWindow(window: AlertWindowState, durationMs: number): void {
    const now = Date.now();
    if (now - window.startedAt < durationMs) {
      return;
    }

    window.startedAt = now;
    window.total = 0;
    window.failed = 0;
  }

  private async emitAlert(
    key: string,
    title: string,
    message: string,
  ): Promise<void> {
    if (!this.enabled) {
      return;
    }

    if (this.owners.length === 0) {
      this.logger.warn(`Skipped alert "${title}" because ALERT_OWNER_EMAILS is empty.`);
      return;
    }

    const now = Date.now();
    const last = this.lastAlertAt.get(key) ?? 0;
    if (now - last < this.cooldownMs) {
      return;
    }
    this.lastAlertAt.set(key, now);

    await Promise.all(
      this.owners.map(async (ownerEmail) => {
        try {
          await this.mailService.sendNotificationAlert(ownerEmail, {
            title,
            message,
            createdAt: new Date(now),
          });
        } catch (error) {
          this.logger.error(
            `Failed sending alert to ${ownerEmail}: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`,
          );
        }
      }),
    );
  }

  private readString(key: string): string | undefined {
    const value = this.configService.get<unknown>(key);
    if (typeof value !== 'string') {
      return undefined;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  private readCsv(key: string): string[] {
    const raw = this.readString(key);
    if (!raw) {
      return [];
    }

    return raw
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  private readBoolean(key: string, fallback: boolean): boolean {
    const raw = this.readString(key)?.toLowerCase();
    if (raw === 'true') {
      return true;
    }
    if (raw === 'false') {
      return false;
    }
    return fallback;
  }

  private readPositiveInt(key: string, fallback: number): number {
    const raw = this.readString(key);
    if (!raw) {
      return fallback;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.floor(parsed);
  }

  private readRate(key: string, fallback: number): number {
    const raw = this.readString(key);
    if (!raw) {
      return fallback;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) {
      return fallback;
    }
    return parsed;
  }

  private readDurationMinutes(key: string, fallbackMinutes: number): number {
    return this.readPositiveInt(key, fallbackMinutes) * 60 * 1000;
  }
}
