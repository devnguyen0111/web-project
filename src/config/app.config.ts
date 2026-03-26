import { registerAs } from '@nestjs/config';

const parseBoolean = (value: string | undefined, fallback: boolean) => {
  if (value === undefined) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
};

const parseNumber = (value: string | undefined, fallback: number) => {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
};

const parseCsv = (value: string | undefined) => {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

export default registerAs('app', () => {
  const env = process.env.NODE_ENV?.trim() || 'development';
  const configuredOrigins = parseCsv(process.env.APP_CORS_ORIGINS);

  return {
    env,
    port: Number(process.env.PORT ?? 3000),
    apiPrefix: process.env.API_PREFIX?.trim() || 'api/v1',
    publicBaseUrl: process.env.APP_PUBLIC_BASE_URL?.trim() || '',
    corsOrigins:
      configuredOrigins.length > 0
        ? configuredOrigins
        : ['http://localhost:3000', 'http://localhost:3001'],
    corsCredentials: parseBoolean(process.env.APP_CORS_CREDENTIALS, true),
    swaggerEnabled: parseBoolean(
      process.env.APP_SWAGGER_ENABLED,
      env !== 'production',
    ),
    swaggerPath: process.env.APP_SWAGGER_PATH?.trim() || 'docs',
    securityHeadersEnabled: parseBoolean(
      process.env.APP_SECURITY_HEADERS_ENABLED,
      true,
    ),
    authPaymentRateLimitEnabled: parseBoolean(
      process.env.APP_AUTH_PAYMENT_RATE_LIMIT_ENABLED,
      true,
    ),
    authPaymentRateLimitWindowMs: parseNumber(
      process.env.APP_AUTH_PAYMENT_RATE_LIMIT_WINDOW_MS,
      60000,
    ),
    authPaymentRateLimitMax: parseNumber(
      process.env.APP_AUTH_PAYMENT_RATE_LIMIT_MAX,
      120,
    ),
  };
});
