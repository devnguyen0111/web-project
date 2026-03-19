import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelDepositDto {
  @ApiPropertyOptional({
    example: 'User requested cancellation from wallet dashboard',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
