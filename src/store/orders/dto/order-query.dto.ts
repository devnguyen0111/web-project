import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { OrderStatus } from '../schemas/order.schema';

export class OrderQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: OrderStatus, example: OrderStatus.PAID })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}
