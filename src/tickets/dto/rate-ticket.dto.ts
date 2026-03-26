import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class RateTicketDto {
  @ApiProperty({ example: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  rating: number;

  @ApiPropertyOptional({ example: 'Support was quick and clear.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
