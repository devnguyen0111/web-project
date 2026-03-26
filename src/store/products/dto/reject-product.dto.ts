import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectProductDto {
  @ApiPropertyOptional({ example: 'Missing required delivery files.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
