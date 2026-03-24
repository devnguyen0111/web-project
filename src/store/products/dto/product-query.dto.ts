import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { ProductType } from '../schemas/product.schema';

export class ProductQueryDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'nestjs' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ enum: ProductType, example: ProductType.DIGITAL })
  @IsOptional()
  @IsEnum(ProductType)
  type?: ProductType;

  @ApiPropertyOptional({ example: 'createdAt', description: 'Reserved for compatibility' })
  @IsOptional()
  @Type(() => String)
  sortBy?: string;
}
