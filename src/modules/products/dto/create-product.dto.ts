import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  ProductCatalogVisibility,
  ProductStatus,
  ProductType,
} from '../../../../generated/prisma/client';
import { SeoMetadataDto } from '../../categories/dto/seo-metadata.dto';
import { UpsertInventoryDto } from '../../inventory/dto/upsert-inventory.dto';
import { ProductImageDto } from './product-image.dto';
import { ProductRelationsDto } from './product-relations.dto';
import { ProductShippingProfileDto } from './product-shipping-profile.dto';

export class CreateProductDto {
  @ApiProperty({ example: 'Giay boot nam da den' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiPropertyOptional({ example: 'giay-boot-nam-da-den' })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional({ example: 'BOOT-BLACK-001' })
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional({ enum: ProductType })
  @IsOptional()
  @IsEnum(ProductType)
  type?: ProductType;

  @ApiPropertyOptional({ enum: ProductStatus })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiPropertyOptional({ enum: ProductCatalogVisibility })
  @IsOptional()
  @IsEnum(ProductCatalogVisibility)
  catalogVisibility?: ProductCatalogVisibility;

  @ApiProperty({ example: 1290000, minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  originalPrice: number;

  @ApiPropertyOptional({ example: 990000, minimum: 0, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  salePrice?: number | null;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  contactForPrice?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shortDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  additionalInfo?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  sizeGuide?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'https://partner.example.com/boot' })
  @IsOptional()
  @IsString()
  externalUrl?: string | null;

  @ApiPropertyOptional({ example: 'Mua ngay' })
  @IsOptional()
  @IsString()
  externalButtonText?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  thumbnailMediaId?: string | null;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isBestSeller?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isNewArrival?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  soldIndividually?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  purchaseNote?: string | null;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  menuOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enableReviews?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  categoryIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  tagIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  brandIds?: string[];

  @ApiPropertyOptional({ type: [ProductImageDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductImageDto)
  images?: ProductImageDto[];

  @ApiPropertyOptional({ type: ProductShippingProfileDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ProductShippingProfileDto)
  shipping?: ProductShippingProfileDto | null;

  @ApiPropertyOptional({ type: UpsertInventoryDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpsertInventoryDto)
  inventory?: UpsertInventoryDto | null;

  @ApiPropertyOptional({ type: ProductRelationsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ProductRelationsDto)
  relations?: ProductRelationsDto | null;

  @ApiPropertyOptional({ type: SeoMetadataDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SeoMetadataDto)
  seo?: SeoMetadataDto;
}
