import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { MediaProvider } from '../../../../generated/prisma/client';

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

export class ListGalleryQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 'gallery' })
  @IsOptional()
  @IsString()
  folder?: string;

  @ApiPropertyOptional({ enum: MediaProvider })
  @IsOptional()
  @IsEnum(MediaProvider)
  provider?: MediaProvider;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ obj, key }) => toOptionalBoolean(obj[key]))
  @IsBoolean()
  forMale?: boolean;
}
