import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateAdminUserDto {
  @ApiPropertyOptional({ example: 'admin@dukystore.local' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'Duky Admin' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  fullName?: string;

  @ApiPropertyOptional({ example: '0900000000', nullable: true })
  @IsOptional()
  @IsString()
  phone?: string | null;
}
