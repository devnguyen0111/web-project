import { Request } from 'express';
import { DepositCustomerContext } from './providers/payment-provider.interface';

export const buildDepositContext = (
  request?: Request,
): DepositCustomerContext => {
  if (!request) {
    return {};
  }

  const headers = request.headers as Record<
    string,
    string | string[] | undefined
  >;
  const forwardedFor = headers['x-forwarded-for'];
  const forwardedIp = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor?.split(',')[0]?.trim();
  const ip =
    forwardedIp || request.ip || request.socket?.remoteAddress || 'unknown-ip';
  const userAgent = headers['user-agent'];
  const normalizedUserAgent = Array.isArray(userAgent)
    ? userAgent[0]
    : userAgent || 'unknown-user-agent';

  return {
    ip,
    userAgent: normalizedUserAgent,
    requestId:
      (headers['x-request-id'] as string | undefined)?.trim() ||
      (headers['x-correlation-id'] as string | undefined)?.trim(),
    fingerprint: `${ip}:${normalizedUserAgent}`,
  };
};
