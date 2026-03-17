import { registerAs } from '@nestjs/config';

const insecureJwtSecretValues = new Set([
  'access-secret-change-me',
  'refresh-secret-change-me',
  'please-change-this-access-secret',
  'please-change-this-refresh-secret',
]);

const getJwtSecret = (
  envKey: 'JWT_ACCESS_SECRET' | 'JWT_REFRESH_SECRET',
): string => {
  const configuredSecret = process.env[envKey]?.trim();
  const isTestEnvironment = process.env.NODE_ENV === 'test';

  if (!configuredSecret) {
    if (isTestEnvironment) {
      return envKey === 'JWT_ACCESS_SECRET'
        ? 'test-access-secret'
        : 'test-refresh-secret';
    }

    throw new Error(
      `${envKey} is required. Add it to your environment variables before starting the server.`,
    );
  }

  if (!isTestEnvironment && insecureJwtSecretValues.has(configuredSecret)) {
    throw new Error(
      `${envKey} is using an insecure placeholder value. Set a strong unique secret.`,
    );
  }

  return configuredSecret;
};

export default registerAs('jwt', () => ({
  accessTokenSecret: getJwtSecret('JWT_ACCESS_SECRET'),
  refreshTokenSecret: getJwtSecret('JWT_REFRESH_SECRET'),
  accessTokenExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
  refreshTokenExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
}));
