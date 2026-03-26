import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PostBlockDto } from './post-block.dto';

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

  @ApiPropertyOptional({
    example: true,
    description: 'If true, poll is always open and ignores endsAt',
  })
  @IsOptional()
  @IsBoolean()
  isPermanent?: boolean;

  @ApiPropertyOptional({
    example: '2026-12-31T23:59:59.000Z',
    description: 'Required when isPermanent is false',
  })
  @IsOptional()
  @IsDateString()
  endsAt?: string;
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

  @ApiProperty({
    type: [PostBlockDto],
    description: 'Block-based post content',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => PostBlockDto)
  blocks: PostBlockDto[];

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

  @ApiPropertyOptional({
    example: false,
    description: 'Whether this post requires VIP to read',
  })
  @IsOptional()
  @IsBoolean()
  isExclusive?: boolean;

  @ApiPropertyOptional({
    example: false,
    description: 'Whether this post is marked as featured',
  })
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional({
    example: false,
    description: 'Whether this post is pinned on top of the blog list',
  })
  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;
}
