import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Put,
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
import { AdjustInventoryDto } from './dto/adjust-inventory.dto';
import { ListInventoryQueryDto } from './dto/list-inventory-query.dto';
import { UpsertInventoryDto } from './dto/upsert-inventory.dto';
import { InventoryService } from './inventory.service';

@ApiTags('Admin Inventory')
@ApiBearerAuth()
@Controller('admin/inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'ORDER_MANAGER')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @ApiOperation({ summary: 'List inventory' })
  list(@Query() query: ListInventoryQueryDto) {
    return this.inventoryService.list(query);
  }

  @Get('analytics/overview')
  @ApiOperation({ summary: 'Get inventory analytics overview' })
  analytics() {
    return this.inventoryService.analytics();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get inventory detail' })
  @ApiParam({ name: 'id' })
  getById(@Param('id') id: string) {
    return this.inventoryService.getById(id);
  }

  @Get(':id/logs')
  @ApiOperation({ summary: 'Get inventory logs' })
  @ApiParam({ name: 'id' })
  getLogs(@Param('id') id: string) {
    return this.inventoryService.getLogs(id);
  }

  @Put('products/:productId')
  @ApiOperation({ summary: 'Create or update product inventory' })
  @ApiParam({ name: 'productId' })
  upsertProductInventory(
    @Param('productId') productId: string,
    @Body() upsertDto: UpsertInventoryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.inventoryService.upsertProductInventory(
      productId,
      upsertDto,
      user.id,
    );
  }

  @Put('variants/:variantId')
  @ApiOperation({ summary: 'Create or update variant inventory' })
  @ApiParam({ name: 'variantId' })
  upsertVariantInventory(
    @Param('variantId') variantId: string,
    @Body() upsertDto: UpsertInventoryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.inventoryService.upsertVariantInventory(
      variantId,
      upsertDto,
      user.id,
    );
  }

  @Patch(':id/adjust')
  @ApiOperation({ summary: 'Adjust inventory quantity and write log' })
  @ApiParam({ name: 'id' })
  adjust(
    @Param('id') id: string,
    @Body() adjustDto: AdjustInventoryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.inventoryService.adjust(id, adjustDto, user.id);
  }
}
