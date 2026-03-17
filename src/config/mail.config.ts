import { registerAs } from '@nestjs/config';

const parsePositiveInt = (value: string | undefined, fallback: number) => {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
};

export default registerAs('mail', () => ({
  host: process.env.MAIL_HOST?.trim() ?? '',
  port: parsePositiveInt(process.env.MAIL_PORT, 587),
  secure: process.env.MAIL_SECURE?.toLowerCase() === 'true',
  user: process.env.MAIL_USER?.trim() ?? '',
  pass: process.env.MAIL_PASS?.trim() ?? '',
  from: process.env.MAIL_FROM?.trim() ?? 'no-reply@example.com',
  verificationCodeExpiresInMinutes: parsePositiveInt(
    process.env.EMAIL_VERIFICATION_CODE_EXPIRES_IN_MINUTES,
    10,
  ),
  passwordResetCodeExpiresInMinutes: parsePositiveInt(
    process.env.PASSWORD_RESET_CODE_EXPIRES_IN_MINUTES,
    10,
  ),
}));
