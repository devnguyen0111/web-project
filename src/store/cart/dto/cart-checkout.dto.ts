import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsMongoId, IsOptional, ArrayNotEmpty } from 'class-validator';

export class CartCheckoutDto {
  @ApiPropertyOptional({
    example: ['67dad1d4ba56ff71fbeb8dbe', '67dad1d4ba56ff71fbeb8dbf'],
    description: 'Optional subset of cart item ids to checkout',
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsMongoId({ each: true })
  itemIds?: string[];
}
