import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectOrderQuoteDto {
  @ApiPropertyOptional({ example: 'Budget is not suitable for now.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
