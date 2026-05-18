import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, ValidateNested } from 'class-validator';
import { UpsertSettingDto } from './upsert-setting.dto';

export class BulkUpsertSettingsDto {
  @ApiProperty({ type: [UpsertSettingDto] })
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpsertSettingDto)
  settings: UpsertSettingDto[];
}
