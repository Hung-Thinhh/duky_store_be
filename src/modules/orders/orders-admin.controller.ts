import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-user.type';
import { CreateAdminOrderDto } from './dto/create-admin-order.dto';
import { ListAdminOrdersQueryDto } from './dto/list-admin-orders-query.dto';
import { UpdateOrderNoteDto } from './dto/update-order-note.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto';
import { OrdersService } from './orders.service';

@ApiTags('Admin Orders')
@ApiBearerAuth()
@Controller('admin/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'ORDER_MANAGER')
export class AdminOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'List orders for admin' })
  list(@Query() query: ListAdminOrdersQueryDto) {
    return this.ordersService.listAdmin(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create manual order from admin' })
  create(
    @Body() createDto: CreateAdminOrderDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ordersService.createAdmin(createDto, user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order detail for admin' })
  @ApiParam({ name: 'id' })
  getById(@Param('id') id: string) {
    return this.ordersService.getById(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update order status' })
  @ApiParam({ name: 'id' })
  updateStatus(
    @Param('id') id: string,
    @Body() updateDto: UpdateOrderStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ordersService.updateStatus(id, updateDto, user.id);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancel order and restore stock' })
  @ApiParam({ name: 'id' })
  cancel(
    @Param('id') id: string,
    @Body() updateDto: UpdateOrderNoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ordersService.cancel(id, updateDto.internalNote, user.id);
  }

  @Patch(':id/note')
  @ApiOperation({ summary: 'Update internal note' })
  @ApiParam({ name: 'id' })
  updateNote(@Param('id') id: string, @Body() updateDto: UpdateOrderNoteDto) {
    return this.ordersService.updateNote(id, updateDto);
  }

  @Patch(':id/payment')
  @ApiOperation({ summary: 'Update payment status' })
  @ApiParam({ name: 'id' })
  updatePayment(
    @Param('id') id: string,
    @Body() updateDto: UpdatePaymentStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ordersService.updatePayment(id, updateDto, user.id);
  }
}
