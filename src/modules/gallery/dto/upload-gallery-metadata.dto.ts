import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

function toOptionalBoolean(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes'].includes(normalized)) return true;
    if (['false', '0', 'no'].includes(normalized)) return false;
  }
  return value;
}

export class UploadGalleryMetadataDto {
  @ApiPropertyOptional({ example: 'Lookbook nữ mùa đông', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  @Matches(/^[^<>]*$/, { message: 'altText must not contain HTML tags' })
  altText?: string;

  @ApiPropertyOptional({ example: 'Lookbook 2026', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  @Matches(/^[^<>]*$/, { message: 'title must not contain HTML tags' })
  title?: string;

  @ApiPropertyOptional({ example: 'lookbook-dong.webp', maxLength: 180 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, {
    message: 'fileName must contain only letters, numbers, dots, underscores, or dashes',
  })
  fileName?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ obj, key }) => toOptionalBoolean(obj[key]))
  @IsBoolean()
  forMale?: boolean;
}
