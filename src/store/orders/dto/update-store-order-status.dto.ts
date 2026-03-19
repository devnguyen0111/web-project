import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { OrderStatus } from '../schemas/order.schema';

export class UpdateStoreOrderStatusDto {
  @ApiProperty({ enum: OrderStatus })
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @ApiPropertyOptional({ example: 'Marked as delivered by support manager' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
