import { createHmac, randomUUID } from 'crypto';

export const buildFallbackSecret = (scope: string): string =>
  `${scope}:local-development-secret`;

export const generateStableId = (prefix: string): string =>
  `${prefix}_${randomUUID().replace(/-/g, '')}`;

export const hmacSha256 = (secret: string, value: string): string =>
  createHmac('sha256', secret).update(value).digest('hex');

export const hmacSha512 = (secret: string, value: string): string =>
  createHmac('sha512', secret).update(value).digest('hex');

export const normalizeUrl = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

export const toPlainObject = (
  value: Record<string, unknown> | undefined,
): Record<string, unknown> => ({ ...(value ?? {}) });
