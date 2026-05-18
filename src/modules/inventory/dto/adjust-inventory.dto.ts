import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { InventoryChangeType } from '../../../../generated/prisma/client';

export class AdjustInventoryDto {
  @ApiProperty({ example: 10 })
  @Type(() => Number)
  @IsInt()
  quantityChange: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  reservedQuantity?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  lowStockThreshold?: number;

  @ApiPropertyOptional({ enum: InventoryChangeType })
  @IsOptional()
  @IsEnum(InventoryChangeType)
  changeType?: InventoryChangeType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
