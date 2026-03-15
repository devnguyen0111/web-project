import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCommentDto {
  @ApiProperty({ example: 'Great post, thanks for sharing!' })
  @IsString()
  @MaxLength(2000)
  content: string;

  @ApiPropertyOptional({ example: '60d39455b9c00b17d89f30f6' })
  @IsOptional()
  @IsMongoId()
  parentId?: string;
}
