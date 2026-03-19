import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import {
  ExternalPaymentProvider,
  TransactionStatus,
  TransactionType,
} from '../schemas/transaction.schema';

export class WalletTransactionQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: TransactionType })
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @ApiPropertyOptional({ enum: TransactionStatus })
  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @ApiPropertyOptional({ enum: ExternalPaymentProvider })
  @IsOptional()
  @IsEnum(ExternalPaymentProvider)
  provider?: ExternalPaymentProvider;

  @ApiPropertyOptional({ example: 'deposit-req-12345' })
  @IsOptional()
  @IsString()
  externalId?: string;

  @ApiPropertyOptional({ example: '2026-03-18T00:00:00.000Z' })
  @IsOptional()
  @Type(() => Date)
  since?: Date;
}
