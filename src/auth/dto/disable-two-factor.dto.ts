import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

export class DisableTwoFactorDto {
  @ApiProperty({
    description: 'Current account password',
    minLength: 6,
  })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({
    required: false,
    description: 'TOTP code from authenticator app',
    example: '123456',
  })
  @ValidateIf((payload: DisableTwoFactorDto) => !payload.backupCode)
  @IsString()
  @MinLength(6)
  @IsOptional()
  code?: string;

  @ApiProperty({
    required: false,
    description: 'One-time backup code',
    example: 'ABCD1234',
  })
  @ValidateIf((payload: DisableTwoFactorDto) => !payload.code)
  @IsString()
  @MinLength(6)
  @IsOptional()
  backupCode?: string;
}
