import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class CreateAddressDto {
  @ApiProperty({ description: 'Full name' })
  @IsNotEmpty()
  @IsString()
  fullName: string;

  @ApiProperty({ description: 'Phone number' })
  @IsNotEmpty()
  @IsString()
  phone: string;

  @ApiProperty({ description: 'Address line / Street address' })
  @IsNotEmpty()
  @IsString()
  addressLine: string;

  @ApiProperty({ description: 'Ward / Commune' })
  @IsNotEmpty()
  @IsString()
  ward: string;

  @ApiProperty({ description: 'District', required: false })
  @IsOptional()
  @IsString()
  district?: string;

  @ApiProperty({ description: 'Province / City' })
  @IsNotEmpty()
  @IsString()
  province: string;

  @ApiProperty({ description: 'Country code', required: false, default: 'VN' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiProperty({ description: 'Is default shipping address', required: false, default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiProperty({ description: 'Additional note', required: false })
  @IsOptional()
  @IsString()
  note?: string;
}
