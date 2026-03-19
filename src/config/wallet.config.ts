import { registerAs } from '@nestjs/config';

const parseNumber = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return parsed;
};

const parsePositiveInt = (
  value: string | undefined,
  fallback: number,
): number => {
  const parsed = parseNumber(value, fallback);
  return parsed > 0 ? Math.floor(parsed) : fallback;
};

const parseOptionalUrl = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

export default registerAs('wallet', () => ({
  coinToVndRate: parsePositiveInt(process.env.COIN_TO_VND_RATE, 1000),
  postRewardCoins: parsePositiveInt(process.env.POST_REWARD_COINS, 1),
  depositFraudWindowMinutes: parsePositiveInt(
    process.env.DEPOSIT_FRAUD_WINDOW_MINUTES,
    15,
  ),
  depositFraudThreshold: parsePositiveInt(
    process.env.DEPOSIT_FRAUD_THRESHOLD,
    3,
  ),
  depositFailureWindowMinutes: parsePositiveInt(
    process.env.DEPOSIT_FAILURE_WINDOW_MINUTES,
    30,
  ),
  providers: {
    payos: {
      clientId: process.env.PAYOS_CLIENT_ID?.trim() ?? '',
      apiKey: process.env.PAYOS_API_KEY?.trim() ?? '',
      checksumKey: process.env.PAYOS_CHECKSUM_KEY?.trim() ?? '',
      partnerCode: process.env.PAYOS_PARTNER_CODE?.trim() ?? '',
      endpoint:
        process.env.PAYOS_ENDPOINT?.trim() ??
        'https://api-merchant.payos.vn/v2/payment-requests',
      paymentBaseUrl:
        process.env.PAYOS_PAYMENT_BASE_URL?.trim() ??
        'https://pay.payos.vn/web',
      returnUrl: parseOptionalUrl(process.env.PAYOS_RETURN_URL),
      cancelUrl: parseOptionalUrl(process.env.PAYOS_CANCEL_URL),
      webhookUrl: parseOptionalUrl(process.env.PAYOS_WEBHOOK_URL),
      currency: process.env.PAYOS_CURRENCY?.trim().toUpperCase() ?? 'VND',
    },
  },
}));
