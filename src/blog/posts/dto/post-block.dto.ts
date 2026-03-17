import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  PostBlockType,
  PostImageSize,
  PostListStyle,
} from '../schemas/post.schema';

export class PostBlockDto {
  @ApiPropertyOptional({
    example: 'intro-1',
    description: 'Optional client-side block identifier',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  id?: string;

  @ApiProperty({ enum: PostBlockType, example: PostBlockType.PARAGRAPH })
  @IsEnum(PostBlockType)
  type: PostBlockType;

  @ApiPropertyOptional({
    example: 'This is a paragraph block',
    description: 'Used by paragraph/heading/quote blocks',
  })
  @ValidateIf(
    (value: PostBlockDto) =>
      value.type === PostBlockType.PARAGRAPH ||
      value.type === PostBlockType.HEADING ||
      value.type === PostBlockType.QUOTE,
  )
  @IsString()
  @MaxLength(10000)
  text?: string;

  @ApiPropertyOptional({
    example: 2,
    description: 'Heading level (1-4), only for heading blocks',
  })
  @ValidateIf((value: PostBlockDto) => value.type === PostBlockType.HEADING)
  @IsInt()
  @Min(1)
  @Max(4)
  level?: number;

  @ApiPropertyOptional({
    type: [String],
    example: ['First point', 'Second point'],
    description: 'Used by list blocks',
  })
  @ValidateIf((value: PostBlockDto) => value.type === PostBlockType.LIST)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(1000, { each: true })
  items?: string[];

  @ApiPropertyOptional({
    enum: PostListStyle,
    example: PostListStyle.UNORDERED,
    description: 'List style, only for list blocks',
  })
  @ValidateIf((value: PostBlockDto) => value.type === PostBlockType.LIST)
  @IsEnum(PostListStyle)
  style?: PostListStyle;

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/post-cover.webp',
    description: 'Image URL, only for image blocks',
  })
  @ValidateIf((value: PostBlockDto) => value.type === PostBlockType.IMAGE)
  @IsString()
  @MaxLength(2000)
  url?: string;

  @ApiPropertyOptional({
    example: 'Architecture diagram',
    description: 'Image alt text, only for image blocks',
  })
  @ValidateIf((value: PostBlockDto) => value.type === PostBlockType.IMAGE)
  @IsOptional()
  @IsString()
  @MaxLength(300)
  alt?: string;

  @ApiPropertyOptional({
    example: 'Figure 1. New architecture flow',
    description: 'Image caption, only for image blocks',
  })
  @ValidateIf((value: PostBlockDto) => value.type === PostBlockType.IMAGE)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  caption?: string;

  @ApiPropertyOptional({
    enum: PostImageSize,
    example: PostImageSize.MEDIUM,
    description: 'Render size for image block',
  })
  @ValidateIf((value: PostBlockDto) => value.type === PostBlockType.IMAGE)
  @IsOptional()
  @IsEnum(PostImageSize)
  size?: PostImageSize;

  @ApiPropertyOptional({
    example: 'const value = await service.execute();',
    description: 'Code content, only for code blocks',
  })
  @ValidateIf((value: PostBlockDto) => value.type === PostBlockType.CODE)
  @IsString()
  @MaxLength(20000)
  code?: string;

  @ApiPropertyOptional({
    example: 'ts',
    description: 'Code language, only for code blocks',
  })
  @ValidateIf((value: PostBlockDto) => value.type === PostBlockType.CODE)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  language?: string;
}
