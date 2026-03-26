import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { OrderStatus } from '../schemas/order.schema';

export class UpdateStoreOrderStatusDto {
  @ApiProperty({ enum: OrderStatus })
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @ApiPropertyOptional({ example: 'Manual status update from support dashboard' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

