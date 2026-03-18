import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomInt } from 'crypto';
import { Role } from '../common/constants/roles.constant';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { JwtPayload } from './strategies/jwt.strategy';

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

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
