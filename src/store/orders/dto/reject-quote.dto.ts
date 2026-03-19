import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectQuoteDto {
  @ApiPropertyOptional({ example: 'Price exceeds my budget' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
