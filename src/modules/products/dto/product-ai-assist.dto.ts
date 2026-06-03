import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum ProductAiTask {
  FULL_DRAFT = 'FULL_DRAFT',
  SEO = 'SEO',
  OPTIMIZE = 'OPTIMIZE',
}

class ProductAiReferenceDto {
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

export class ProductAiAssistDto {
  @ApiProperty({ enum: ProductAiTask })
  @IsEnum(ProductAiTask)
  task: ProductAiTask;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(220)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shortDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string; // HTML content

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  focusKeyword?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  productType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tone?: string;

  @ApiPropertyOptional({ type: [ProductAiReferenceDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductAiReferenceDto)
  categories?: ProductAiReferenceDto[];

  @ApiPropertyOptional({ type: [ProductAiReferenceDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductAiReferenceDto)
  tags?: ProductAiReferenceDto[];

  @ApiPropertyOptional({ type: [ProductAiReferenceDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductAiReferenceDto)
  brands?: ProductAiReferenceDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  originalPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  salePrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  stockQuantity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  variants?: any[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  extraContext?: Record<string, any>;
}
