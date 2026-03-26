import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsMongoId,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateOrderDto {
  @ApiProperty({ example: '67f6d95c15f1af8a57f3d0a1' })
  @IsMongoId()
  productId: string;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({ example: 'order-buy-now-001' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;

  @ApiPropertyOptional({
    example: { requirement: 'Need 4 revisions and source files' },
    description: 'Used for custom-order requests',
  })
  @IsOptional()
  @IsObject()
  customData?: Record<string, unknown>;
}
