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
}
