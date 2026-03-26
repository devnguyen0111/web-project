import { registerAs } from '@nestjs/config';

const parsePositiveInt = (
  value: string | undefined,
  fallback: number,
): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
};

const parseBoolean = (
  value: string | undefined,
  fallback: boolean,
): boolean => {
  if (value === undefined) {
    return fallback;
  }

  return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
};

const parsePercent = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  if (parsed > 100) {
    return 100;
  }

  return parsed;
};

export default registerAs('store', () => ({
  ownerUserId: process.env.STORE_OWNER_USER_ID?.trim() ?? '',
  platformFeePercent: parsePercent(process.env.STORE_PLATFORM_FEE_PERCENT, 10),
  downloadUrlTtlSeconds: parsePositiveInt(
    process.env.STORE_DOWNLOAD_URL_TTL_SECONDS,
    3600,
  ),
  autoCompleteDays: parsePositiveInt(process.env.STORE_AUTO_COMPLETE_DAYS, 7),
  emailDownloadTokenSecret:
    process.env.STORE_EMAIL_DOWNLOAD_TOKEN_SECRET?.trim() ?? '',
  emailDownloadTokenTtlSeconds: parsePositiveInt(
    process.env.STORE_EMAIL_DOWNLOAD_TOKEN_TTL_SECONDS,
    604800,
  ),
  deliveryEmailEnabled: parseBoolean(
    process.env.STORE_DELIVERY_EMAIL_ENABLED,
    true,
  ),
}));
