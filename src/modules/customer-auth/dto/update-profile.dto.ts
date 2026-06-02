import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

export class UpdateProfileDto {
  @ApiProperty({ description: 'Full name', required: false })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  fullName?: string;

  @ApiProperty({ description: 'Phone number', required: false })
  @IsOptional()
  @IsString()
  phone?: string;
}
