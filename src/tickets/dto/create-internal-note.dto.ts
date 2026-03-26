import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { TicketMessageAttachmentDto } from './ticket-message-attachment.dto';

export class CreateInternalNoteDto {
  @ApiProperty({ example: 'Escalation candidate due to deadline risk.' })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content: string;

  @ApiPropertyOptional({ type: [TicketMessageAttachmentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TicketMessageAttachmentDto)
  attachments?: TicketMessageAttachmentDto[];
}
