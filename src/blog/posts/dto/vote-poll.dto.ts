import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class VotePollDto {
  @ApiProperty({ example: 0, description: 'Index of poll option (0-based)' })
  @IsInt()
  @Min(0)
  optionIndex: number;
}
