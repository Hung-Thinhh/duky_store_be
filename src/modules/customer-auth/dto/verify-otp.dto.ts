import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length } from 'class-validator';

export class VerifyOtpDto {
  @ApiProperty({ description: 'Customer email address' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: '6-digit OTP verification code' })
  @IsString()
  @Length(6, 6)
  otpCode: string;
}
