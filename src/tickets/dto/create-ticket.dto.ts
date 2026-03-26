import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  TicketCategory,
  TicketPriority,
  TicketRelatedType,
} from '../schemas/ticket.schema';
import { TicketMessageAttachmentDto } from './ticket-message-attachment.dto';

class TicketRelatedToDto {
  @ApiProperty({ enum: TicketRelatedType, example: TicketRelatedType.ORDER })
  @IsEnum(TicketRelatedType)
  type: TicketRelatedType;

  @ApiProperty({ example: '67f6d95c15f1af8a57f3d0a1' })
  @IsMongoId()
  id: string;
}

export class CreateTicketDto {
  @ApiProperty({ example: 'Need support for custom order delivery revision' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  subject: string;

  @ApiPropertyOptional({
    enum: TicketCategory,
    example: TicketCategory.CUSTOM_ORDER,
  })
  @IsOptional()
  @IsEnum(TicketCategory)
  category?: TicketCategory;

  @ApiPropertyOptional({ enum: TicketPriority, example: TicketPriority.HIGH })
  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @ApiPropertyOptional({ type: TicketRelatedToDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => TicketRelatedToDto)
  relatedTo?: TicketRelatedToDto;

  @ApiProperty({
    example:
      'I need 2 additional revisions and editable source files for this custom order.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message: string;

  @ApiPropertyOptional({ type: [TicketMessageAttachmentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TicketMessageAttachmentDto)
  attachments?: TicketMessageAttachmentDto[];

  @ApiPropertyOptional({
    type: [String],
    example: ['custom-order', 'urgent'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  tags?: string[];
}
