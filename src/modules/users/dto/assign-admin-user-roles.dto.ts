import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class AssignAdminUserRolesDto {
  @ApiProperty({ example: ['ADMIN'] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  roleNames: string[];
}
