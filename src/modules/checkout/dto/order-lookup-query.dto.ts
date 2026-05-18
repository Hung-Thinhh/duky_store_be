import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class OrderLookupQueryDto {
  @ApiProperty({ example: '0901234567' })
  @IsString()
  @MinLength(8)
  @MaxLength(20)
  phone: string;
}
