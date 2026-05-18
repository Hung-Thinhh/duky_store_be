import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ListSettingsQueryDto } from './dto/list-settings-query.dto';
import { SettingsService } from './settings.service';

@ApiTags('Settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('public')
  @ApiOperation({ summary: 'List public settings for client app' })
  listPublic(@Query() query: ListSettingsQueryDto) {
    return this.settingsService.listPublic(query);
  }
}
