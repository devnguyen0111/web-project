import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, Matches } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'Reset code must contain 6 digits' })
  code: string;

  @ApiProperty({ example: 'newStrongPassword123' })
  @IsString()
  @Length(6, 50)
  newPassword: string;
}
