import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UploadMediaMetadataDto {
  @ApiPropertyOptional({ example: 'Áo blazer nữ màu đen', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  @Matches(/^[^<>]*$/, { message: 'altText must not contain HTML tags' })
  altText?: string;

  @ApiPropertyOptional({ example: 'Áo blazer nữ 2026', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  @Matches(/^[^<>]*$/, { message: 'title must not contain HTML tags' })
  title?: string;

  @ApiPropertyOptional({ example: 'boot-nu-co-thap.webp', maxLength: 180 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, {
    message: 'fileName must contain only letters, numbers, dots, underscores, or dashes',
  })
  fileName?: string;
}
