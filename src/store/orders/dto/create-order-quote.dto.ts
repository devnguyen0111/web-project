import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateOrderQuoteDto {
  @ApiProperty({ example: 250000 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  priceAmount: number;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  estimatedDays?: number;

  @ApiPropertyOptional({ example: 'Includes source files and two revisions.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
