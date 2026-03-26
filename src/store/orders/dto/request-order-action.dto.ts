import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RequestOrderActionDto {
  @ApiPropertyOptional({ example: 'Need to cancel because requirements changed.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

