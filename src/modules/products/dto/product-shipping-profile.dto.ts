import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ProductShippingProfileDto {
  @ApiPropertyOptional({ example: 1.2, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  weight?: number | null;

  @ApiPropertyOptional({ example: 32, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  length?: number | null;

  @ApiPropertyOptional({ example: 22, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  width?: number | null;

  @ApiPropertyOptional({ example: 12, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  height?: number | null;

  @ApiPropertyOptional({ example: 'standard' })
  @IsOptional()
  @IsString()
  shippingClass?: string | null;
}
