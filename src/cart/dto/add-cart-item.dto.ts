import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsMongoId, Min } from 'class-validator';

export class AddCartItemDto {
  @ApiProperty({ example: '67f6d95c15f1af8a57f3d0a1' })
  @IsMongoId()
  productId: string;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;
}
