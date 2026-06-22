import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateKeywordPlanDto {
  @IsString()
  @IsNotEmpty()
  keyword: string;

  @IsString()
  @IsNotEmpty()
  cluster: string;

  @IsString()
  @IsNotEmpty()
  intent: string;

  @IsString()
  @IsNotEmpty()
  priority: string;

  @IsString()
  @IsNotEmpty()
  status: string;

  @IsString()
  @IsNotEmpty()
  owner: string;

  @IsString()
  @IsOptional()
  targetPath?: string;
}

export class UpdateKeywordPlanDto {
  @IsString()
  @IsOptional()
  keyword?: string;

  @IsString()
  @IsOptional()
  cluster?: string;

  @IsString()
  @IsOptional()
  intent?: string;

  @IsString()
  @IsOptional()
  priority?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  owner?: string;

  @IsString()
  @IsOptional()
  targetPath?: string;
}
