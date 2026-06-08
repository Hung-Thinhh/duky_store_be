import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsBoolean,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class GscUrlInputDto {
  @IsString()
  url!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class AnalyzeGscUrlsDto {
  @IsArray()
  @ArrayMaxSize(2500)
  @ValidateNested({ each: true })
  @Type(() => GscUrlInputDto)
  urls!: GscUrlInputDto[];
}

export class InspectGscUrlsDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => GscUrlInputDto)
  urls!: GscUrlInputDto[];

  @IsOptional()
  @IsString()
  siteUrl?: string;

  @IsOptional()
  @IsString()
  languageCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  delayMs?: number;
}

export class GetGscCandidatesQueryDto {
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined
      ? undefined
      : value === true || value === 'true' || value === '1',
  )
  @IsBoolean()
  includeLiveSitemap?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2500)
  limit?: number;
}

export class SubmitIndexingDto {
  @IsString()
  url!: string;

  @IsOptional()
  @IsString()
  type?: 'URL_UPDATED' | 'URL_DELETED';
}

