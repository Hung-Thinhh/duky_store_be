import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CustomersService } from './customers.service';
import { ListCustomerOrdersQueryDto } from './dto/list-customer-orders-query.dto';
import { ListCustomersQueryDto } from './dto/list-customers-query.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@ApiTags('Admin Customers')
@ApiBearerAuth()
@Controller('admin/customers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'ORDER_MANAGER')
export class AdminCustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @ApiOperation({ summary: 'List customers for admin' })
  list(@Query() query: ListCustomersQueryDto) {
    return this.customersService.listAdmin(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get customer detail for admin' })
  @ApiParam({ name: 'id' })
  getById(@Param('id') id: string) {
    return this.customersService.getById(id);
  }

  @Get(':id/orders')
  @ApiOperation({ summary: 'Get customer order history' })
  @ApiParam({ name: 'id' })
  getOrders(
    @Param('id') id: string,
    @Query() query: ListCustomerOrdersQueryDto,
  ) {
    return this.customersService.listOrders(id, query);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update customer profile, status, type or note' })
  @ApiParam({ name: 'id' })
  update(@Param('id') id: string, @Body() updateDto: UpdateCustomerDto) {
    return this.customersService.update(id, updateDto);
  }
}
