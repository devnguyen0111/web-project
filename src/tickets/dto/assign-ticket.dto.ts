import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

export class AssignTicketDto {
  @ApiProperty({ example: '67f6d95c15f1af8a57f3d0a1' })
  @IsMongoId()
  assignedTo: string;
}
