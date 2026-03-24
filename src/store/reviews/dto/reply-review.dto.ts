import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ReplyReviewDto {
  @ApiProperty({ example: 'Thanks for the feedback, we will improve this part.' })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  message: string;
}
