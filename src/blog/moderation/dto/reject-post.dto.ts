import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class RejectPostDto {
  @ApiProperty({ example: 'Please improve structure and references' })
  @IsString()
  @MaxLength(1000)
  reason: string;
}
