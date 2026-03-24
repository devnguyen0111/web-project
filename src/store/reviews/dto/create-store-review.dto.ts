import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min, Max } from 'class-validator';

export class CreateStoreReviewDto {
  @ApiProperty({ example: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ example: 'Seller is very responsive and helpful' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  content?: string;
}
