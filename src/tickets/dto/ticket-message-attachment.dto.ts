import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class TicketMessageAttachmentDto {
  @ApiProperty({ example: 'requirements.pdf' })
  @IsString()
  @MaxLength(255)
  fileName: string;

  @ApiProperty({ example: 'https://cdn.example.com/tickets/requirements.pdf' })
  @IsString()
  @MaxLength(2000)
  url: string;

  @ApiPropertyOptional({ example: 102400 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  size?: number;

  @ApiPropertyOptional({ example: 'application/pdf' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  mimeType?: string;
}
