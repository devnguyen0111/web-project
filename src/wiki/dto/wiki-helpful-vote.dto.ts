import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { WikiHelpfulVote } from '../schemas/wiki-article-vote.schema';

export class WikiHelpfulVoteDto {
  @ApiProperty({ enum: WikiHelpfulVote, example: WikiHelpfulVote.YES })
  @IsEnum(WikiHelpfulVote)
  value: WikiHelpfulVote;
}

