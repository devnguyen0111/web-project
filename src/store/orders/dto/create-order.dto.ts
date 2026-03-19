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
  @IsMongoId()
  productId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity = 1;

  @IsOptional()
  @IsObject()
  customData?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  buyerNote?: string;
}
