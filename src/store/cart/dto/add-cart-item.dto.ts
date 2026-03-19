import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsMongoId, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class AddCartItemDto {
  @ApiProperty({ example: '67dad1d4ba56ff71fbeb8dbe' })
  @IsMongoId()
  productId: string;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity = 1;

  @ApiPropertyOptional({
    example: { color: 'blue', size: 'xl' },
    description: 'Optional custom configuration for the product',
  })
  @IsOptional()
  @IsObject()
  customData?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'Please prioritize delivery before Friday' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  buyerNote?: string;
}
