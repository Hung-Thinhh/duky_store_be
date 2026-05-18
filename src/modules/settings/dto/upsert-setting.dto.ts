import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SettingValueType } from '../../../../generated/prisma/client';

export class UpsertSettingDto {
  @ApiProperty({ example: 'site.name' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  key: string;

  @ApiPropertyOptional({ example: 'site' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  group?: string;

  @ApiProperty()
  value: unknown;

  @ApiPropertyOptional({ enum: SettingValueType })
  @IsOptional()
  @IsEnum(SettingValueType)
  valueType?: SettingValueType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
