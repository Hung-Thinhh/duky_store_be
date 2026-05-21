import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ description: 'Customer email address' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Password (8–72 characters)' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  @ApiProperty({ description: 'Password confirmation (must match password)' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  passwordConfirmation: string;
}
