import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

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

export class PublicGalleryQueryDto {
  @ApiPropertyOptional({ example: true, description: 'Filter by gender: true for male lookbook, false for female' })
  @IsOptional()
  @Transform(({ obj, key }) => toOptionalBoolean(obj[key]))
  @IsBoolean()
  forMale?: boolean;
}
