import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReopenTicketDto {
  @ApiPropertyOptional({
    example: 'Need another revision based on latest file.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
