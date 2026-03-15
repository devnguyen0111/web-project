import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class CreatePollOptionDto {
  @ApiProperty({ example: 'Yes' })
  @IsString()
  @MaxLength(200)
  text: string;
}

class CreatePollDto {
  @ApiProperty({ example: 'Do you like this article?' })
  @IsString()
  @MaxLength(300)
  question: string;

  @ApiProperty({ type: [CreatePollOptionDto] })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => CreatePollOptionDto)
  options: CreatePollOptionDto[];
}

export class CreatePostDto {
  @ApiProperty({ example: 'NestJS Best Practices' })
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({ example: 'Quick summary of this post' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  excerpt?: string;

  @ApiProperty({ example: 'Full post content in markdown or plain text' })
  @IsString()
  content: string;

  @ApiPropertyOptional({ example: '60d39455b9c00b17d89f30f6' })
  @IsOptional()
  @IsMongoId()
  categoryId?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['60d39455b9c00b17d89f30f6', '60d39455b9c00b17d89f30f7'],
  })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  tagIds?: string[];

  @ApiPropertyOptional({ type: CreatePollDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreatePollDto)
  poll?: CreatePollDto;
}
