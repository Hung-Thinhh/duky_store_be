import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength, IsBoolean } from 'class-validator';

export class CreateAdminUserDto {
  @ApiProperty({ example: 'admin@dukystore.local' })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Duky Admin' })
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  fullName: string;

  @ApiProperty({ example: '123456' })
  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  password: string;

  @ApiPropertyOptional({ example: 'EDITOR' })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: '0900000000', nullable: true })
  @IsOptional()
  @IsString()
  phone?: string | null;
}
