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
} from 'class-validator';

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

export class CreateExternalMediaDto {
  @ApiProperty({ example: 'https://cdn.example.com/products/boot-black.jpg' })
  @IsUrl({ require_protocol: true })
  url: string;

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/products/boot-black.jpg',
  })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  secureUrl?: string;

  @ApiPropertyOptional({ example: 'boot-black.jpg' })
  @IsOptional()
  @IsString()
  fileName?: string;

  @ApiPropertyOptional({ example: 'boot-black-original.jpg' })
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

  @ApiPropertyOptional({ example: 'products' })
  @IsOptional()
  @IsString()
  folder?: string;

  @ApiPropertyOptional({ example: 'Giay boot nam da den' })
  @IsOptional()
  @IsString()
  altText?: string;

  @ApiPropertyOptional({ example: 'Boot nam da den' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'wordpress:12345' })
  @IsOptional()
  @IsString()
  providerKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
