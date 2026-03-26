import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

export class VerifyTwoFactorDto {
  @ApiProperty({
    description: 'Setup token or login challenge token',
  })
  @IsString()
  token: string;

  @ApiProperty({
    required: false,
    description: 'TOTP code from authenticator app',
    example: '123456',
  })
  @ValidateIf((payload: VerifyTwoFactorDto) => !payload.backupCode)
  @IsString()
  @MinLength(6)
  @IsOptional()
  code?: string;

  @ApiProperty({
    required: false,
    description: 'One-time backup code',
    example: 'ABCD1234',
  })
  @ValidateIf((payload: VerifyTwoFactorDto) => !payload.code)
  @IsString()
  @MinLength(6)
  @IsOptional()
  backupCode?: string;
}
