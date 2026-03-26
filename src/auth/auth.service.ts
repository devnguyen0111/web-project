import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomInt,
} from 'crypto';
import { authenticator } from 'otplib';
import { Role } from '../common/constants/roles.constant';
import { MailService } from '../mail/mail.service';
import { UserDocument } from '../users/schemas/user.schema';
import { UsersService } from '../users/users.service';
import { DisableTwoFactorDto } from './dto/disable-two-factor.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { VerifyTwoFactorDto } from './dto/verify-two-factor.dto';
import { JwtPayload } from './strategies/jwt.strategy';

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

type TwoFactorPurpose = 'setup' | 'login';

type TwoFactorTokenPayload = JwtPayload & {
  purpose: TwoFactorPurpose;
  secretEncrypted?: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {}

  async register(payload: RegisterDto) {
    const existingUser = await this.usersService.findByEmail(payload.email);
    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const user = await this.usersService.create({
      fullName: payload.fullName,
      email: payload.email,
      password: payload.password,
      role: Role.AUTHOR,
      isEmailVerified: false,
    });

    await this.issueEmailVerificationCode(user.id, user.email);

    return {
      message: 'Registration successful. Verification code sent to your email.',
      requiresEmailVerification: true,
      user: this.usersService.toResponse(user),
    };
  }

  async login(payload: LoginDto) {
    const user = await this.usersService.findByEmailWithSensitive(
      payload.email,
    );
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(
      payload.password,
      user.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.isActive === false) {
      throw new ForbiddenException('Account has been disabled');
    }

    if (!user.isEmailVerified) {
      await this.issueEmailVerificationCode(user.id, user.email);
      throw new ForbiddenException(
        'Email is not verified. A new verification code has been sent.',
      );
    }

    if (user.twoFactor?.enabled) {
      const expiresInSeconds = this.getTwoFactorChallengeTtlSeconds();
      const twoFactorToken = await this.generateTwoFactorToken(
        user.id,
        user.email,
        user.role,
        'login',
      );

      return {
        requiresTwoFactor: true,
        twoFactorToken,
        expiresInSeconds,
        user: this.usersService.toResponse(user),
      };
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.usersService.updateRefreshToken(user.id, tokens.refreshToken);

    return {
      user: this.usersService.toResponse(user),
      ...tokens,
    };
  }

  async refreshTokens(userId: string, refreshToken: string) {
    const user = await this.usersService.findByIdWithSensitive(userId);
    if (!user?.refreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (user.isActive === false) {
      throw new UnauthorizedException('Account has been disabled');
    }

    if (!user.isEmailVerified) {
      throw new UnauthorizedException('Email is not verified');
    }

    const isRefreshTokenValid = await bcrypt.compare(
      refreshToken,
      user.refreshToken,
    );
    if (!isRefreshTokenValid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.usersService.updateRefreshToken(user.id, tokens.refreshToken);

    return {
      user: this.usersService.toResponse(user),
      ...tokens,
    };
  }

  async verifyRefreshToken(refreshToken: string): Promise<JwtPayload> {
    try {
      return await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.configService.getOrThrow<string>('jwt.refreshTokenSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async logout(userId: string) {
    await this.usersService.updateRefreshToken(userId, null);
    return { message: 'Logged out successfully' };
  }

  async verifyEmail(payload: VerifyEmailDto) {
    const user = await this.usersService.findByEmailWithSensitive(
      payload.email,
    );
    if (!user) {
      throw new BadRequestException('Invalid or expired verification code');
    }

    if (user.isEmailVerified) {
      return {
        message: 'Email is already verified',
        user: this.usersService.toResponse(user),
      };
    }

    const isCodeValid =
      !!user.emailVerificationCodeHash &&
      !!user.emailVerificationCodeExpiresAt &&
      user.emailVerificationCodeExpiresAt.getTime() > Date.now() &&
      user.emailVerificationCodeHash === this.hashCode(payload.code);

    if (!isCodeValid) {
      throw new BadRequestException('Invalid or expired verification code');
    }

    const updatedUser = await this.usersService.markEmailAsVerified(user.id);

    return {
      message: 'Email verified successfully',
      user: this.usersService.toResponse(updatedUser),
    };
  }

  async forgotPassword(payload: ForgotPasswordDto) {
    const user = await this.usersService.findByEmail(payload.email);
    if (user) {
      await this.issuePasswordResetCode(user.id, user.email);
    }

    return {
      message:
        'If the email exists, a password reset code has been sent to your email.',
    };
  }

  async resetPassword(payload: ResetPasswordDto) {
    const user = await this.usersService.findByEmailWithSensitive(
      payload.email,
    );

    const isCodeValid =
      !!user?.passwordResetCodeHash &&
      !!user.passwordResetCodeExpiresAt &&
      user.passwordResetCodeExpiresAt.getTime() > Date.now() &&
      user.passwordResetCodeHash === this.hashCode(payload.code);

    if (!isCodeValid) {
      throw new BadRequestException('Invalid or expired reset code');
    }

    await this.usersService.updatePassword(user.id, payload.newPassword);
    await this.usersService.clearPasswordResetCode(user.id);
    await this.usersService.updateRefreshToken(user.id, null);

    return { message: 'Password reset successfully' };
  }

  async enableTwoFactor(userId: string) {
    const user = await this.usersService.findByIdOrFail(userId);
    if (user.isActive === false) {
      throw new ForbiddenException('Account has been disabled');
    }

    if (!user.isEmailVerified) {
      throw new ForbiddenException(
        'Email must be verified before enabling 2FA',
      );
    }

    const issuer =
      this.configService.get<string>('twoFactor.issuer') || 'DN Web Project';
    const secret = authenticator.generateSecret();
    const setupToken = await this.generateTwoFactorToken(
      user.id,
      user.email,
      user.role,
      'setup',
      this.encryptTwoFactorSecret(secret),
    );

    return {
      setupToken,
      otpAuthUrl: authenticator.keyuri(user.email, issuer, secret),
      manualEntryKey: secret,
      expiresInSeconds: this.getTwoFactorChallengeTtlSeconds(),
    };
  }

  async verifyTwoFactor(payload: VerifyTwoFactorDto) {
    const decoded = await this.verifyTwoFactorToken(payload.token);
    const user = await this.usersService.findByIdWithSensitive(decoded.sub);
    if (!user) {
      throw new UnauthorizedException('Invalid or expired two-factor token');
    }

    if (user.isActive === false) {
      throw new ForbiddenException('Account has been disabled');
    }

    if (decoded.purpose === 'setup') {
      return this.verifyTwoFactorSetup(user, payload, decoded);
    }

    return this.verifyTwoFactorLogin(user, payload);
  }

  async disableTwoFactor(userId: string, payload: DisableTwoFactorDto) {
    const user = await this.usersService.findByIdWithSensitive(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.twoFactor?.enabled || !user.twoFactor?.secretEncrypted) {
      throw new BadRequestException('Two-factor authentication is not enabled');
    }

    const passwordValid = await bcrypt.compare(payload.password, user.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid password');
    }

    const verification = await this.verifyTwoFactorFactor(
      user,
      payload.code,
      payload.backupCode,
    );
    await this.persistTwoFactorState(user.id, {
      enabled: false,
      secretEncrypted: null,
      backupCodeHashes: [],
      enabledAt: null,
      lastVerifiedAt: verification.verifiedAt,
    });

    await this.usersService.updateRefreshToken(user.id, null);
    const updated = await this.usersService.findByIdOrFail(user.id);

    return {
      message: 'Two-factor authentication disabled successfully',
      user: this.usersService.toResponse(updated),
    };
  }

  private async verifyTwoFactorSetup(
    user: UserDocument,
    payload: VerifyTwoFactorDto,
    decoded: TwoFactorTokenPayload,
  ) {
    if (!payload.code?.trim()) {
      throw new BadRequestException(
        'TOTP code is required for setup verification',
      );
    }

    if (!decoded.secretEncrypted) {
      throw new UnauthorizedException('Invalid or expired setup token');
    }

    const secret = this.decryptTwoFactorSecret(decoded.secretEncrypted);
    const valid = this.verifyTotpCode(secret, payload.code);
    if (!valid) {
      throw new UnauthorizedException('Invalid two-factor code');
    }

    const backupCodes = this.generateBackupCodes();
    const backupCodeHashes = await Promise.all(
      backupCodes.map((code) => bcrypt.hash(code, 10)),
    );
    const verifiedAt = new Date();

    await this.persistTwoFactorState(user.id, {
      enabled: true,
      secretEncrypted: this.encryptTwoFactorSecret(secret),
      backupCodeHashes,
      enabledAt: user.twoFactor?.enabledAt ?? verifiedAt,
      lastVerifiedAt: verifiedAt,
    });

    const updated = await this.usersService.findByIdOrFail(user.id);
    return {
      message: 'Two-factor authentication enabled successfully',
      backupCodes,
      user: this.usersService.toResponse(updated),
    };
  }

  private async verifyTwoFactorLogin(
    user: UserDocument,
    payload: VerifyTwoFactorDto,
  ) {
    if (!user.twoFactor?.enabled || !user.twoFactor.secretEncrypted) {
      throw new UnauthorizedException(
        'Two-factor authentication is not enabled',
      );
    }

    const verification = await this.verifyTwoFactorFactor(
      user,
      payload.code,
      payload.backupCode,
    );

    await this.persistTwoFactorState(user.id, {
      enabled: true,
      secretEncrypted: user.twoFactor.secretEncrypted,
      backupCodeHashes: verification.remainingBackupCodeHashes,
      enabledAt: user.twoFactor.enabledAt ?? new Date(),
      lastVerifiedAt: verification.verifiedAt,
    });

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.usersService.updateRefreshToken(user.id, tokens.refreshToken);

    const updated = await this.usersService.findByIdOrFail(user.id);
    return {
      requiresTwoFactor: false,
      user: this.usersService.toResponse(updated),
      ...tokens,
    };
  }

  private async verifyTwoFactorFactor(
    user: UserDocument,
    code?: string,
    backupCode?: string,
  ): Promise<{
    verifiedAt: Date;
    remainingBackupCodeHashes: string[];
  }> {
    const secretEncrypted = user.twoFactor?.secretEncrypted;
    if (!secretEncrypted) {
      throw new UnauthorizedException('Two-factor secret is missing');
    }

    const normalizedCode = code?.trim();
    if (normalizedCode) {
      const secret = this.decryptTwoFactorSecret(secretEncrypted);
      const valid = this.verifyTotpCode(secret, normalizedCode);
      if (!valid) {
        throw new UnauthorizedException('Invalid two-factor code');
      }

      return {
        verifiedAt: new Date(),
        remainingBackupCodeHashes: user.twoFactor?.backupCodeHashes ?? [],
      };
    }

    const normalizedBackupCode = this.normalizeBackupCode(backupCode);
    if (!normalizedBackupCode) {
      throw new BadRequestException('TOTP code or backup code is required');
    }

    const backupCodeHashes = [...(user.twoFactor?.backupCodeHashes ?? [])];
    let matchedIndex = -1;
    for (let index = 0; index < backupCodeHashes.length; index += 1) {
      const hash = backupCodeHashes[index];
      const matched = await bcrypt.compare(normalizedBackupCode, hash);
      if (matched) {
        matchedIndex = index;
        break;
      }
    }

    if (matchedIndex < 0) {
      throw new UnauthorizedException('Invalid backup code');
    }

    backupCodeHashes.splice(matchedIndex, 1);
    return {
      verifiedAt: new Date(),
      remainingBackupCodeHashes: backupCodeHashes,
    };
  }

  private async persistTwoFactorState(
    userId: string,
    input: {
      enabled: boolean;
      secretEncrypted: string | null;
      backupCodeHashes: string[];
      enabledAt: Date | null;
      lastVerifiedAt: Date | null;
    },
  ): Promise<void> {
    await this.usersService.updateTwoFactorState(userId, input);
  }

  private async generateTwoFactorToken(
    userId: string,
    email: string,
    role: Role,
    purpose: TwoFactorPurpose,
    secretEncrypted?: string,
  ): Promise<string> {
    const payload: TwoFactorTokenPayload = {
      sub: userId,
      email,
      role,
      purpose,
      secretEncrypted,
    };

    return this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('jwt.accessTokenSecret'),
      expiresIn: `${this.getTwoFactorChallengeTtlSeconds()}s`,
    });
  }

  private async verifyTwoFactorToken(
    token: string,
  ): Promise<TwoFactorTokenPayload> {
    const normalized = token?.trim();
    if (!normalized) {
      throw new BadRequestException('Two-factor token is required');
    }

    try {
      const decoded = await this.jwtService.verifyAsync<TwoFactorTokenPayload>(
        normalized,
        {
          secret: this.configService.getOrThrow<string>(
            'jwt.accessTokenSecret',
          ),
        },
      );

      if (
        !decoded?.sub ||
        (decoded.purpose !== 'setup' && decoded.purpose !== 'login')
      ) {
        throw new UnauthorizedException('Invalid or expired two-factor token');
      }

      return decoded;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new UnauthorizedException('Invalid or expired two-factor token');
    }
  }

  private verifyTotpCode(secret: string, code: string): boolean {
    return authenticator.verify({
      token: code.trim(),
      secret,
    });
  }

  private getTwoFactorEncryptionKey(): Buffer {
    return this.configService.getOrThrow<Buffer>('twoFactor.encryptionKey');
  }

  private getTwoFactorChallengeTtlSeconds(): number {
    return (
      this.configService.get<number>('twoFactor.challengeTtlSeconds') ?? 300
    );
  }

  private getTwoFactorBackupCodeCount(): number {
    return this.configService.get<number>('twoFactor.backupCodeCount') ?? 10;
  }

  private encryptTwoFactorSecret(secret: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(
      'aes-256-gcm',
      this.getTwoFactorEncryptionKey(),
      iv,
    );
    const encrypted = Buffer.concat([
      cipher.update(secret, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  private decryptTwoFactorSecret(cipherText: string): string {
    try {
      const [ivPart, authTagPart, payloadPart] = cipherText.split(':');
      if (!ivPart || !authTagPart || !payloadPart) {
        throw new UnauthorizedException('Invalid two-factor secret payload');
      }

      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.getTwoFactorEncryptionKey(),
        Buffer.from(ivPart, 'base64'),
      );
      decipher.setAuthTag(Buffer.from(authTagPart, 'base64'));
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(payloadPart, 'base64')),
        decipher.final(),
      ]);
      return decrypted.toString('utf8');
    } catch {
      throw new UnauthorizedException('Invalid two-factor secret payload');
    }
  }

  private generateBackupCodes(): string[] {
    const total = Math.max(1, this.getTwoFactorBackupCodeCount());
    const generated = new Set<string>();

    while (generated.size < total) {
      generated.add(randomBytes(4).toString('hex').toUpperCase());
    }

    return [...generated];
  }

  private normalizeBackupCode(code?: string): string | undefined {
    if (!code) {
      return undefined;
    }

    const normalized = code.trim().replace(/[\s-]/g, '').toUpperCase();
    return normalized || undefined;
  }

  private async generateTokens(
    userId: string,
    email: string,
    role: Role,
  ): Promise<AuthTokens> {
    const payload: JwtPayload = { sub: userId, email, role };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>('jwt.accessTokenSecret'),
        expiresIn: this.configService.getOrThrow<string>(
          'jwt.accessTokenExpiresIn',
        ) as never,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>('jwt.refreshTokenSecret'),
        expiresIn: this.configService.getOrThrow<string>(
          'jwt.refreshTokenExpiresIn',
        ) as never,
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private hashCode(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  private generateNumericCode(length = 6): string {
    let code = '';
    for (let i = 0; i < length; i += 1) {
      code += randomInt(0, 10).toString();
    }
    return code;
  }

  private buildExpirationDate(minutes: number): Date {
    return new Date(Date.now() + minutes * 60 * 1000);
  }

  private async issueEmailVerificationCode(
    userId: string,
    email: string,
  ): Promise<void> {
    const code = this.generateNumericCode();
    const expiresInMinutes =
      this.configService.get<number>('mail.verificationCodeExpiresInMinutes') ??
      10;

    await this.usersService.updateEmailVerificationCode(
      userId,
      this.hashCode(code),
      this.buildExpirationDate(expiresInMinutes),
    );

    await this.mailService.sendVerificationCode(email, code, expiresInMinutes);
  }

  private async issuePasswordResetCode(
    userId: string,
    email: string,
  ): Promise<void> {
    const code = this.generateNumericCode();
    const expiresInMinutes =
      this.configService.get<number>(
        'mail.passwordResetCodeExpiresInMinutes',
      ) ?? 10;

    await this.usersService.updatePasswordResetCode(
      userId,
      this.hashCode(code),
      this.buildExpirationDate(expiresInMinutes),
    );

    await this.mailService.sendPasswordResetCode(email, code, expiresInMinutes);
  }
}
