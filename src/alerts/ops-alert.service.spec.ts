import { ConfigService } from '@nestjs/config';
import { MailService } from '../mail/mail.service';
import { OpsAlertService } from './ops-alert.service';

describe('OpsAlertService', () => {
  const buildConfigService = (values: Record<string, unknown>) =>
    ({
      get: jest.fn((key: string) => values[key]),
    }) as unknown as ConfigService;

  it('sends webhook failure-rate alert when threshold is reached', async () => {
    const mailService = {
      sendNotificationAlert: jest.fn().mockResolvedValue(undefined),
    } as unknown as MailService;
    const configService = buildConfigService({
      NODE_ENV: 'production',
      ALERTS_ENABLED: 'true',
      ALERT_OWNER_EMAILS: 'ops@example.com',
      ALERT_WEBHOOK_MIN_SAMPLES: '3',
      ALERT_WEBHOOK_FAILURE_RATE_THRESHOLD: '0.5',
      ALERT_COOLDOWN_MINUTES: '1',
    });
    const service = new OpsAlertService(configService, mailService);

    service.recordWebhookResult({ success: false, reason: 'bad signature' });
    service.recordWebhookResult({ success: true });
    service.recordWebhookResult({ success: false, reason: 'callback failed' });

    await Promise.resolve();
    await Promise.resolve();

    expect(mailService.sendNotificationAlert).toHaveBeenCalledTimes(1);
    expect(mailService.sendNotificationAlert).toHaveBeenCalledWith(
      'ops@example.com',
      expect.objectContaining({
        title: expect.stringContaining('Webhook/payment failure rate alert'),
      }),
    );
  });

  it('sends health degraded alert after configured consecutive failures', async () => {
    const mailService = {
      sendNotificationAlert: jest.fn().mockResolvedValue(undefined),
    } as unknown as MailService;
    const configService = buildConfigService({
      NODE_ENV: 'production',
      ALERTS_ENABLED: 'true',
      ALERT_OWNER_EMAILS: 'ops@example.com',
      ALERT_HEALTH_CONSECUTIVE_DEGRADED_THRESHOLD: '2',
      ALERT_COOLDOWN_MINUTES: '1',
    });
    const service = new OpsAlertService(configService, mailService);

    service.recordHealthReadiness('degraded', {
      mongodb: 'ok',
      payosConfig: 'degraded',
      appConfig: 'ok',
    });
    service.recordHealthReadiness('degraded', {
      mongodb: 'ok',
      payosConfig: 'degraded',
      appConfig: 'ok',
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(mailService.sendNotificationAlert).toHaveBeenCalledTimes(1);
    expect(mailService.sendNotificationAlert).toHaveBeenCalledWith(
      'ops@example.com',
      expect.objectContaining({
        title: 'Health readiness degraded',
      }),
    );
  });
});
