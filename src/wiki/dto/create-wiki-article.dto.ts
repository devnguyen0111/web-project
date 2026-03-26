import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  WikiArticleStatus,
  WikiRequiredTier,
} from '../schemas/wiki-article.schema';

class WikiBreadcrumbItemDto {
  @ApiProperty({ example: '67f6d95c15f1af8a57f3d0a1' })
  @IsMongoId()
  articleId: string;

  @ApiProperty({ example: 'Orders' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: 'orders' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  slug: string;
}

export class CreateWikiArticleDto {
  @ApiProperty({ example: 'How To Create Orders' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: 'how-to-create-orders' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  slug: string;

  @ApiProperty({ example: 'Detailed markdown/text content...' })
  @IsString()
  @MinLength(1)
  content: string;

  @ApiPropertyOptional({ example: 'Quick summary' })
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  excerpt?: string;

  @ApiPropertyOptional({ example: '67f6d95c15f1af8a57f3d0a1' })
  @IsOptional()
  @IsMongoId()
  categoryId?: string;

  @ApiPropertyOptional({ type: [String], example: ['orders', 'guide'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  tags?: string[];

  @ApiPropertyOptional({ example: '67f6d95c15f1af8a57f3d0a1' })
  @IsOptional()
  @IsMongoId()
  parentArticleId?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  order?: number;

  @ApiPropertyOptional({ type: [WikiBreadcrumbItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WikiBreadcrumbItemDto)
  breadcrumb?: WikiBreadcrumbItemDto[];

  @ApiPropertyOptional({ enum: WikiArticleStatus, example: WikiArticleStatus.DRAFT })
  @IsOptional()
  @IsEnum(WikiArticleStatus)
  status?: WikiArticleStatus;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({ enum: WikiRequiredTier })
  @IsOptional()
  @IsEnum(WikiRequiredTier)
  requiredTier?: WikiRequiredTier;

  @ApiPropertyOptional({ example: 'Initial article version' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  summary?: string;
}

