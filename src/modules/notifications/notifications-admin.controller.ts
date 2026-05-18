import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ListNotificationLogsQueryDto } from './dto/list-notification-logs-query.dto';
import { SendTestEmailDto } from './dto/send-test-email.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('Admin Notifications')
@ApiBearerAuth()
@Controller('admin/notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
export class AdminNotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('logs')
  @ApiOperation({ summary: 'List notification logs' })
  listLogs(@Query() query: ListNotificationLogsQueryDto) {
    return this.notificationsService.listLogs(query);
  }

  @Post('test-email')
  @ApiOperation({ summary: 'Queue a test email' })
  sendTestEmail(@Body() sendDto: SendTestEmailDto) {
    return this.notificationsService.enqueueRawEmail({
      recipient: sendDto.recipient,
      subject: sendDto.subject ?? 'Duky Store email test',
      body: sendDto.body ?? 'Email queue is working.',
      entityType: 'system',
      entityId: 'test-email',
    });
  }
}
