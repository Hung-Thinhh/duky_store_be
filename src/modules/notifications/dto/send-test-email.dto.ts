import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SendTestEmailDto {
  @ApiProperty({ example: 'admin@dukystore.local' })
  @IsEmail()
  recipient: string;

  @ApiPropertyOptional({ example: 'Duky Store email test' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  subject?: string;

  @ApiPropertyOptional({ example: 'Email queue is working.' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  body?: string;
}
