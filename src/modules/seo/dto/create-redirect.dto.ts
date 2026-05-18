import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { RedirectStatus } from '../../../../generated/prisma/client';

export class CreateRedirectDto {
  @ApiProperty({ example: '/old-url/' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  sourcePath: string;

  @ApiProperty({ example: '/new-url/' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  targetPath: string;

  @ApiPropertyOptional({ default: 301, enum: [301, 302, 307, 308] })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([301, 302, 307, 308])
  statusCode?: number;

  @ApiPropertyOptional({ enum: RedirectStatus })
  @IsOptional()
  @IsEnum(RedirectStatus)
  status?: RedirectStatus;
}
