import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod } from '../../../../generated/prisma/client';

export enum AdminOrderSource {
  DIRECT = 'DIRECT',
  ONLINE = 'ONLINE',
}

export class CreateAdminOrderItemDto {
  @IsString()
  productId: string;

  @IsOptional()
  @IsString()
  variantId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateAdminOrderDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  customerName: string;

  @IsString()
  @MinLength(8)
  @MaxLength(20)
  customerPhone: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  customerEmail?: string;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @IsEnum(AdminOrderSource)
  source: AdminOrderSource;

  @IsString()
  @MinLength(3)
  @MaxLength(255)
  addressLine: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  ward?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  district?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  province?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  country?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  shippingFee?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  customerNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  internalNote?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateAdminOrderItemDto)
  items: CreateAdminOrderItemDto[];
}
