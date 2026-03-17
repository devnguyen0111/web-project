import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new account' })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  async register(@Body() payload: RegisterDto) {
    return this.authService.register(payload);
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Login and receive access/refresh tokens' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 201, description: 'Login successful' })
  async login(@Body() payload: LoginDto) {
    return this.authService.login(payload);
  }

  @Public()
  @Post('verify-email')
  @ApiOperation({ summary: 'Verify email with a one-time code' })
  @ApiBody({ type: VerifyEmailDto })
  @ApiResponse({ status: 201, description: 'Email verified successfully' })
  async verifyEmail(@Body() payload: VerifyEmailDto) {
    return this.authService.verifyEmail(payload);
  }

  @Public()
  @Post('forgot-password')
  @ApiOperation({ summary: 'Send password reset code to email' })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({
    status: 201,
    description: 'Reset code sent (if email exists)',
  })
  async forgotPassword(@Body() payload: ForgotPasswordDto) {
    return this.authService.forgotPassword(payload);
  }

  @Public()
  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password with one-time code' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({ status: 201, description: 'Password reset successfully' })
  async resetPassword(@Body() payload: ResetPasswordDto) {
    return this.authService.resetPassword(payload);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Rotate access/refresh tokens by refresh token' })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({ status: 201, description: 'Token refreshed successfully' })
  async refresh(@Body() payload: RefreshTokenDto) {
    const decoded = await this.authService.verifyRefreshToken(
      payload.refreshToken,
    );
    return this.authService.refreshTokens(decoded.sub, payload.refreshToken);
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Get current authenticated user' })
  @ApiResponse({ status: 200, description: 'Current user returned' })
  async me(@CurrentUser('userId') userId: string) {
    const user = await this.usersService.findByIdOrFail(userId);
    return this.usersService.toResponse(user);
  }

  @ApiBearerAuth()
  @Post('logout')
  @ApiOperation({ summary: 'Logout and clear stored refresh token' })
  @ApiResponse({ status: 201, description: 'Logout successful' })
  async logout(@CurrentUser('userId') userId: string) {
    return this.authService.logout(userId);
  }
}
