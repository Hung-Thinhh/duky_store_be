import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { SizeGender } from '../../../../generated/prisma/client';

export class CreateProductVariantDto {
  @ApiPropertyOptional({ example: 'Size 42 - Black' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'product-id-uuid' })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiProperty({ example: 'BOOT-BLACK-42' })
  @IsString()
  sku: string;

  @ApiPropertyOptional({ example: '42' })
  @IsOptional()
  @IsString()
  sizeLabel?: string;

  @ApiPropertyOptional({ enum: SizeGender })
  @IsOptional()
  @IsEnum(SizeGender)
  sizeGender?: SizeGender;

  @ApiPropertyOptional({ example: 'Black' })
  @IsOptional()
  @IsString()
  colorName?: string;

  @ApiPropertyOptional({ example: '#000000' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  colorHex?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  salePrice?: number | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
