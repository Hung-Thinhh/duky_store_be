import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsString, Min, MinLength } from 'class-validator';

export class UpdateCartItemDto {
  @ApiProperty({ example: 'guest-session-uuid' })
  @IsString()
  @MinLength(8)
  sessionId: string;

  @ApiProperty({ example: 2, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;
}
