import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class RejectProductDto {
  @ApiProperty({ example: 'Missing licensing details' })
  @IsString()
  @MaxLength(500)
  reason: string;
}
