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

export class CreateTicketMessageDto {
  @ApiProperty({
    example: 'Please help me update the logo and color palette for this order.',
  })
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
