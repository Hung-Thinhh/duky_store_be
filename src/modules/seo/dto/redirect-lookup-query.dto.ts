import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RedirectLookupQueryDto {
  @ApiProperty({ example: '/san-pham/old-url/' })
  @IsString()
  @MinLength(1)
  path: string;
}
