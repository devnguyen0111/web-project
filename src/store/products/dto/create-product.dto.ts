import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ProductStatus, ProductType } from '../schemas/product.schema';

export class CreateProductDto {
  @ApiProperty({ example: 'NestJS API Deep Dive' })
  @IsString()
  @MaxLength(160)
  name: string;

  @ApiPropertyOptional({ example: 'Advanced architecture patterns for NestJS' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @ApiPropertyOptional({
    enum: ProductType,
    example: ProductType.DIGITAL,
    default: ProductType.DIGITAL,
  })
  @IsOptional()
  @IsEnum(ProductType)
  type?: ProductType;

  @ApiPropertyOptional({
    enum: ProductStatus,
    example: ProductStatus.DRAFT,
    default: ProductStatus.DRAFT,
    description:
      'Reserved. Product moderation flow controls status transitions in runtime.',
  })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiProperty({ example: 150000, description: 'Wallet charge amount (VND)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  priceAmount: number;

  @ApiPropertyOptional({ example: 'VND', default: 'VND' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @ApiPropertyOptional({
    example: 10,
    description: 'Optional stock for digital slots',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock?: number;

  @ApiPropertyOptional({
    example: '60d39455b9c00b17d89f30f6',
    description: 'Category with scope=store',
  })
  @IsOptional()
  @IsMongoId()
  categoryId?: string;

  @ApiPropertyOptional({
    example: false,
    description: 'Whether this product is visible for VIP users only',
  })
  @IsOptional()
  @IsBoolean()
  vipOnly?: boolean;
}
