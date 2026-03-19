# Ops Alerts

## Owner

- Primary owner: value in `ALERT_OWNER_EMAILS` (comma-separated emails).
- Example:

```env
ALERT_OWNER_EMAILS=platform-oncall@yourdomain.com,sre-lead@yourdomain.com
```

## Thresholds (Default Baseline)

```env
ALERTS_ENABLED=true
ALERT_COOLDOWN_MINUTES=30

ALERT_WEBHOOK_WINDOW_MINUTES=15
ALERT_WEBHOOK_MIN_SAMPLES=20
ALERT_WEBHOOK_FAILURE_RATE_THRESHOLD=0.2

ALERT_RENEWAL_WINDOW_MINUTES=60
ALERT_RENEWAL_MIN_SAMPLES=10
ALERT_RENEWAL_FAILURE_RATE_THRESHOLD=0.3

ALERT_HEALTH_CONSECUTIVE_DEGRADED_THRESHOLD=3
```

## What Is Alerted

- Webhook/payment failure-rate alert:
  - Triggered when callback failure rate in the webhook window is greater than or equal to `ALERT_WEBHOOK_FAILURE_RATE_THRESHOLD`.
- Renewal failure-rate alert:
  - Triggered when renewal failure rate in the renewal window is greater than or equal to `ALERT_RENEWAL_FAILURE_RATE_THRESHOLD`.
- Health degraded alert:
  - Triggered when readiness is degraded for consecutive checks greater than or equal to `ALERT_HEALTH_CONSECUTIVE_DEGRADED_THRESHOLD`.

## Implementation Hooks

- Webhook/payment callback: `src/wallet/wallet.service.ts`
- Auto-renew renewal result: `src/subscriptions/subscriptions.service.ts`
- Readiness degradation: `src/health/health.service.ts`
- Alert engine: `src/alerts/ops-alert.service.ts`
