import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsMongoId,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class AdminAdjustWalletDto {
  @ApiProperty({ example: '66c0a5d3c0d3b8f7d1e4a111' })
  @IsMongoId()
  userId: string;

  @ApiProperty({ example: 50 })
  @Type(() => Number)
  @IsPositive()
  amount: number;

  @ApiProperty({ example: true, description: 'true = credit, false = debit' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  credit?: boolean;

  @ApiPropertyOptional({
    example: 'credit',
    enum: ['credit', 'debit'],
    description: 'Alias for credit boolean (credit=true, debit=false)',
  })
  @IsOptional()
  @IsIn(['credit', 'debit'])
  direction?: 'credit' | 'debit';

  @ApiPropertyOptional({ example: 'manual correction after refund' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({ example: 'support ticket #123' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional({ example: 'wallet-adjust-20260318-001' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}
