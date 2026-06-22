import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ description: 'Customer email address' })
  @IsEmail()
  email: string;
}
