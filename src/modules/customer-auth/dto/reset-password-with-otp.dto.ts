import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordWithOtpDto {
  @ApiProperty({ description: 'Customer email address' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: '6-digit OTP verification code' })
  @IsString()
  @Length(6, 6)
  otpCode: string;

  @ApiProperty({ description: 'New password (8–72 characters)' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword: string;

  @ApiProperty({ description: 'Confirm new password' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  confirmPassword: string;
}
