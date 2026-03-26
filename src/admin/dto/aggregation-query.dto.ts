import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';

export enum AggregationGroupBy {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

export class AggregationQueryDto {
  @ApiPropertyOptional({ example: '2026-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-03-31T23:59:59.999Z' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    enum: AggregationGroupBy,
    default: AggregationGroupBy.DAY,
  })
  @IsOptional()
  @IsEnum(AggregationGroupBy)
  groupBy: AggregationGroupBy = AggregationGroupBy.DAY;
}
