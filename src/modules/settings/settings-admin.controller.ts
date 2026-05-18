import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BulkUpsertSettingsDto } from './dto/bulk-upsert-settings.dto';
import { ListSettingsQueryDto } from './dto/list-settings-query.dto';
import { UpsertSettingDto } from './dto/upsert-setting.dto';
import { SettingsService } from './settings.service';

@ApiTags('Admin Settings')
@ApiBearerAuth()
@Controller('admin/settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
export class AdminSettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'List settings for admin' })
  list(@Query() query: ListSettingsQueryDto) {
    return this.settingsService.listAdmin(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create or update setting' })
  upsert(@Body() upsertDto: UpsertSettingDto) {
    return this.settingsService.upsert(upsertDto);
  }

  @Patch('bulk')
  @ApiOperation({ summary: 'Bulk create or update settings' })
  bulkUpsert(@Body() bulkDto: BulkUpsertSettingsDto) {
    return this.settingsService.bulkUpsert(bulkDto);
  }

  @Get(':key')
  @ApiOperation({ summary: 'Get setting by key' })
  @ApiParam({ name: 'key' })
  getByKey(@Param('key') key: string) {
    return this.settingsService.getByKey(key);
  }
}
