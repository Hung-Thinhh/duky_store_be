import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum BlogAiTask {
  FULL_DRAFT = 'FULL_DRAFT',
  SEO = 'SEO',
  OUTLINE = 'OUTLINE',
  OPTIMIZE = 'OPTIMIZE',
  INTERNAL_LINKS = 'INTERNAL_LINKS',
  IMAGE_ALT = 'IMAGE_ALT',
}

export enum BlogAiBlockType {
  TITLE = 'title',
  CONTENT = 'content',
  FOOTER = 'footer',
}

class BlogAiReferenceDto {
  @ApiProperty()
  @IsString()
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  url?: string;
}

export class BlogAiAssistDto {
  @ApiProperty({ enum: BlogAiTask })
  @IsEnum(BlogAiTask)
  task: BlogAiTask;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(220)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  excerpt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  focusKeyword?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  articleType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tone?: string;

  @ApiPropertyOptional({ type: [BlogAiReferenceDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BlogAiReferenceDto)
  categories?: BlogAiReferenceDto[];

  @ApiPropertyOptional({ type: [BlogAiReferenceDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BlogAiReferenceDto)
  tags?: BlogAiReferenceDto[];

  @ApiPropertyOptional({ type: [BlogAiReferenceDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BlogAiReferenceDto)
  products?: BlogAiReferenceDto[];

  @ApiPropertyOptional({ type: [BlogAiReferenceDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BlogAiReferenceDto)
  relatedPosts?: BlogAiReferenceDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  extraContext?: Record<string, unknown>;
}

export class BlogAiBlockAssistDto {
  @ApiProperty()
  @IsString()
  @MaxLength(1000)
  instruction: string;

  @ApiProperty()
  @IsString()
  @MaxLength(20000)
  blockHtml: string;

  @ApiProperty({ enum: BlogAiBlockType })
  @IsEnum(BlogAiBlockType)
  blockType: BlogAiBlockType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(220)
  articleTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  articleExcerpt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  focusKeyword?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  articleType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  tone?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  outline?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(6000)
  previousBlockHtml?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(6000)
  nextBlockHtml?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  seoScore?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  seoFailedChecks?: string[];
}
