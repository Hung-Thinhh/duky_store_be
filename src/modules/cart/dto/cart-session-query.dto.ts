import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CartSessionQueryDto {
  @ApiProperty({ example: 'guest-session-uuid' })
  @IsString()
  @MinLength(8)
  sessionId: string;
}
