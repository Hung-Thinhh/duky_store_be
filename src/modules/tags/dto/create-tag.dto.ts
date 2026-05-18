import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { TagType } from '../../../../generated/prisma/client';

export class CreateTagDto {
  @ApiProperty({ example: 'boots' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiPropertyOptional({ example: 'boots' })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional({ enum: TagType })
  @IsOptional()
  @IsEnum(TagType)
  type?: TagType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}
