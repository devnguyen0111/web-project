import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';
import { OrderQueryDto } from './order-query.dto';

export class StoreOrderQueryDto extends OrderQueryDto {
  @ApiPropertyOptional({ example: 'ORD-20260319' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  orderNumber?: string;

  @ApiPropertyOptional({ example: '67dad1d4ba56ff71fbeb8dbe' })
  @IsOptional()
  @IsMongoId()
  buyerId?: string;

  @ApiPropertyOptional({ example: '67dad1d4ba56ff71fbeb8dbf' })
  @IsOptional()
  @IsMongoId()
  sellerId?: string;
}
