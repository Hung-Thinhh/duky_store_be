import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import {
  ContentStatus,
  HomepageSectionType,
} from '../../../../generated/prisma/client';

export class ListHomepageSectionsQueryDto {
  @ApiPropertyOptional({ enum: HomepageSectionType })
  @IsOptional()
  @IsEnum(HomepageSectionType)
  type?: HomepageSectionType;

  @ApiPropertyOptional({ enum: ContentStatus })
  @IsOptional()
  @IsEnum(ContentStatus)
  status?: ContentStatus;
}
