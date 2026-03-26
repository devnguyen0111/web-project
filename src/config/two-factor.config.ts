import { registerAs } from '@nestjs/config';

const parsePositiveNumber = (
  value: string | undefined,
  fallback: number,
): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
};

const parseEncryptionKey = (raw: string | undefined): Buffer => {
  const isTestEnvironment = process.env.NODE_ENV === 'test';

  if (!raw || !raw.trim()) {
    if (isTestEnvironment) {
      return Buffer.from('0123456789abcdef0123456789abcdef', 'utf8');
    }

    throw new Error(
      'TWO_FACTOR_ENCRYPTION_KEY is required for two-factor authentication',
    );
  }

  const normalized = raw.trim();

  let key: Buffer;
  if (normalized.toLowerCase().startsWith('base64:')) {
    key = Buffer.from(normalized.slice(7), 'base64');
  } else if (/^[0-9a-f]{64}$/i.test(normalized)) {
    key = Buffer.from(normalized, 'hex');
  } else {
    key = Buffer.from(normalized, 'utf8');
  }

  if (key.length !== 32) {
    throw new Error(
      'TWO_FACTOR_ENCRYPTION_KEY must resolve to exactly 32 bytes (AES-256-GCM)',
    );
  }

  return key;
};

export default registerAs('twoFactor', () => ({
  encryptionKey: parseEncryptionKey(process.env.TWO_FACTOR_ENCRYPTION_KEY),
  issuer: process.env.TWO_FACTOR_ISSUER?.trim() || 'DN Web Project',
  challengeTtlSeconds: parsePositiveNumber(
    process.env.TWO_FACTOR_CHALLENGE_TTL_SECONDS,
    300,
  ),
  backupCodeCount: parsePositiveNumber(
    process.env.TWO_FACTOR_BACKUP_CODE_COUNT,
    10,
  ),
}));
