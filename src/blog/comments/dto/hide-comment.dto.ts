import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class HideCommentDto {
  @ApiPropertyOptional({ example: 'Inappropriate language' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
