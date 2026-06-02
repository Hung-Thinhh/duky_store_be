import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  IsBoolean,
} from 'class-validator';

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

export class CreateExternalGalleryDto {
  @ApiProperty({ example: 'https://cdn.example.com/gallery/lookbook1.jpg' })
  @IsUrl({ require_protocol: true })
  url: string;

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/gallery/lookbook1.jpg',
  })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  secureUrl?: string;

  @ApiPropertyOptional({ example: 'lookbook1.jpg' })
  @IsOptional()
  @IsString()
  fileName?: string;

  @ApiPropertyOptional({ example: 'lookbook1-original.jpg' })
  @IsOptional()
  @IsString()
  originalName?: string;

  @ApiPropertyOptional({ example: 'image/jpeg' })
  @IsOptional()
  @IsString()
  mimeType?: string;

  @ApiPropertyOptional({ maximum: MAX_IMAGE_SIZE_BYTES })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_IMAGE_SIZE_BYTES)
  size?: number;

  @ApiPropertyOptional({ example: 1200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  width?: number;

  @ApiPropertyOptional({ example: 1200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  height?: number;

  @ApiPropertyOptional({ example: 'gallery' })
  @IsOptional()
  @IsString()
  folder?: string;

  @ApiPropertyOptional({ example: 'Lookbook mua dong 2026' })
  @IsOptional()
  @IsString()
  altText?: string;

  @ApiPropertyOptional({ example: 'Lookbook dong 2026' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'wordpress:12345' })
  @IsOptional()
  @IsString()
  providerKey?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  forMale?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
