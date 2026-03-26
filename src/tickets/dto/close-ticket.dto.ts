import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CloseTicketDto {
  @ApiPropertyOptional({ example: 'Issue has been solved, thanks.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
