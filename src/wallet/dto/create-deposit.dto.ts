import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { ExternalPaymentProvider } from '../schemas/transaction.schema';

export class CreateDepositDto {
  @ApiProperty({ example: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  coinAmount: number;

  @ApiPropertyOptional({
    example: 100,
    description: 'Alias of coinAmount for client compatibility',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount?: number;

  @ApiPropertyOptional({
    enum: ExternalPaymentProvider,
    example: ExternalPaymentProvider.PAYOS,
    description:
      'Only PayOS is supported. Other legacy values are normalized to payos.',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value !== 'string') {
      return value;
    }

    const normalized = value.trim().toLowerCase();
    if (['vnpay', 'momo', 'stripe', 'payos'].includes(normalized)) {
      return ExternalPaymentProvider.PAYOS;
    }

    return normalized;
  })
  @IsEnum(ExternalPaymentProvider)
  provider?: ExternalPaymentProvider;

  @ApiPropertyOptional({ example: 230000, description: 'Real payment amount' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amountReal?: number;

  @ApiPropertyOptional({ example: 'VND' })
  @IsOptional()
  @IsString()
  @Length(3, 8)
  currency?: string;

  @ApiPropertyOptional({ example: 2300, description: 'Real-to-coin exchange' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  exchangeRate?: number;

  @ApiPropertyOptional({ example: 'wallet top up for course purchase' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiPropertyOptional({ example: 'deposit-req-12345' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}
