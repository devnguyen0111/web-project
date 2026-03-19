import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ProductCustomFieldType,
  ProductType,
} from '../schemas/product.schema';

class ProductImageDto {
  @ApiProperty({ example: 'https://cdn.example.com/product.png' })
  @IsString()
  @MaxLength(500)
  url: string;

  @ApiPropertyOptional({ example: 'Product image' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  alt?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

class ProductFileDto {
  @ApiProperty({ example: 'guide.pdf' })
  @IsString()
  @MaxLength(255)
  filename: string;

  @ApiProperty({ example: 'products/guide.pdf' })
  @IsString()
  @MaxLength(500)
  storagePath: string;

  @ApiProperty({ example: 1048576 })
  @IsNumber()
  @Min(0)
  size: number;

  @ApiProperty({ example: 'application/pdf' })
  @IsString()
  @MaxLength(200)
  mimeType: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}

class ProductEstimatedDaysDto {
  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  @Min(0)
  min?: number;

  @ApiPropertyOptional({ example: 7 })
  @IsOptional()
  @IsInt()
  @Min(0)
  max?: number;
}

class ProductSubscriberDiscountDto {
  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  pro?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  vip?: number;
}

class ProductCustomFieldDto {
  @ApiProperty({ example: 'Brand name' })
  @IsString()
  @MaxLength(100)
  label: string;

  @ApiProperty({ enum: ProductCustomFieldType })
  @IsEnum(ProductCustomFieldType)
  type: ProductCustomFieldType;

  @ApiPropertyOptional({ type: [String], example: ['WordPress', 'Shopify'] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  options?: string[];

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ example: 'Enter your business name' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  placeholder?: string;
}

export class CreateProductDto {
  @ApiProperty({ example: 'Professional Logo Template Pack' })
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ example: 'Editable digital pack for small businesses' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  shortDescription?: string;

  @ApiPropertyOptional({ example: 'Full description for the product' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: [ProductImageDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ProductImageDto)
  images?: ProductImageDto[];

  @ApiPropertyOptional({ example: 'https://cdn.example.com/preview.png' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  previewUrl?: string;

  @ApiPropertyOptional({ enum: ProductType, example: ProductType.DIGITAL })
  @IsOptional()
  @IsEnum(ProductType)
  type?: ProductType;

  @ApiPropertyOptional({ type: [ProductFileDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ProductFileDto)
  files?: ProductFileDto[];

  @ApiPropertyOptional({ type: [ProductCustomFieldDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ProductCustomFieldDto)
  customFields?: ProductCustomFieldDto[];

  @ApiPropertyOptional({ type: ProductEstimatedDaysDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ProductEstimatedDaysDto)
  estimatedDays?: ProductEstimatedDaysDto;

  @ApiProperty({ example: 150000 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ example: 180000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  originalPrice?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isOnSale?: boolean;

  @ApiPropertyOptional({ example: '2026-12-31T23:59:59.000Z' })
  @IsOptional()
  @IsDateString()
  saleEndsAt?: string;

  @ApiPropertyOptional({ example: '60d39455b9c00b17d89f30f6' })
  @IsOptional()
  @IsMongoId()
  categoryId?: string;

  @ApiPropertyOptional({ type: [String], example: ['design', 'logo'] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags?: string[];

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxPerUser?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional({ type: ProductSubscriberDiscountDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ProductSubscriberDiscountDto)
  subscriberDiscount?: ProductSubscriberDiscountDto;
}
