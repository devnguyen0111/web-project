import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class QuoteOrderDto {
  @ApiProperty({ example: 250000 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  estimatedDays?: number;

  @ApiPropertyOptional({ example: 'Will deliver in Figma and PNG package' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
