import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString } from 'class-validator';
import { SeoEntityType } from '../../../../generated/prisma/client';

export class SeoMetadataQueryDto {
  @ApiProperty({ enum: SeoEntityType })
  @IsEnum(SeoEntityType)
  entityType: SeoEntityType;

  @ApiProperty()
  @IsString()
  entityId: string;
}
