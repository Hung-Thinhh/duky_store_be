import {
  Body,
  Controller,
  Delete,
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
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-user.type';
import { CreateProductDto } from './dto/create-product.dto';
import { ListAdminProductsQueryDto } from './dto/list-admin-products-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

@ApiTags('Admin Products')
@ApiBearerAuth()
@Controller('admin/products')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'CONTENT_EDITOR', 'ORDER_MANAGER', 'STAFF')
export class AdminProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @RequirePermissions('products.read')
  @ApiOperation({ summary: 'List products for admin' })
  list(@Query() query: ListAdminProductsQueryDto) {
    return this.productsService.listAdmin(query);
  }

  @Post()
  @RequirePermissions('products.create')
  @ApiOperation({ summary: 'Create product' })
  create(@Body() createDto: CreateProductDto, @CurrentUser() user: AuthUser) {
    return this.productsService.create(createDto, user.id);
  }

  @Get(':id')
  @RequirePermissions('products.read')
  @ApiOperation({ summary: 'Get product detail for admin' })
  @ApiParam({ name: 'id' })
  getById(@Param('id') id: string) {
    return this.productsService.getById(id);
  }

  @Patch(':id')
  @RequirePermissions('products.update')
  @ApiOperation({ summary: 'Update product' })
  @ApiParam({ name: 'id' })
  update(
    @Param('id') id: string,
    @Body() updateDto: UpdateProductDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.productsService.update(id, updateDto, user.id);
  }

  @Delete(':id')
  @RequirePermissions('products.delete')
  @ApiOperation({ summary: 'Soft delete product' })
  @ApiParam({ name: 'id' })
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }
}
