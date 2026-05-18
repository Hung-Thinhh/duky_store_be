import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'Admin@123456' })
  @IsString()
  currentPassword: string;

  @ApiProperty({ example: 'Admin@1234567' })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
