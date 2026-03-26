import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import {
  TicketCategory,
  TicketPriority,
  TicketRelatedType,
  TicketStatus,
} from '../schemas/ticket.schema';

export class TicketQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: TicketStatus })
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @ApiPropertyOptional({ enum: TicketPriority })
  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @ApiPropertyOptional({ enum: TicketCategory })
  @IsOptional()
  @IsEnum(TicketCategory)
  category?: TicketCategory;

  @ApiPropertyOptional({ enum: TicketRelatedType })
  @IsOptional()
  @IsEnum(TicketRelatedType)
  relatedType?: TicketRelatedType;

  @ApiPropertyOptional({
    description: 'Filter by related resource id (used with relatedType)',
  })
  @IsOptional()
  @IsMongoId()
  relatedId?: string;

  @ApiPropertyOptional({ description: 'Staff/Admin only' })
  @IsOptional()
  @IsMongoId()
  assignedTo?: string;

  @ApiPropertyOptional({ description: 'Staff/Admin only' })
  @IsOptional()
  @IsMongoId()
  createdBy?: string;

  @ApiPropertyOptional({
    description: 'Search by subject or ticket number',
    example: 'TK-20260324',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}
