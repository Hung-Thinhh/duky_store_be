import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class QuickUpdateVariantDto {
  @ApiPropertyOptional({ description: 'Giá bán lẻ của biến thể' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ description: 'Giá khuyến mãi của biến thể', nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  salePrice?: number | null;

  @ApiPropertyOptional({ description: 'Số lượng tồn kho thực tế của biến thể' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;

  @ApiPropertyOptional({ description: 'Ghi chú thay đổi tồn kho' })
  @IsOptional()
  @IsString()
  note?: string;
}
