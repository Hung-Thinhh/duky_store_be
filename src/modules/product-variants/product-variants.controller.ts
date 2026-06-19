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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-user.type';
import { CreateProductVariantDto } from './dto/create-product-variant.dto';
import { ListProductVariantsQueryDto } from './dto/list-product-variants-query.dto';
import { QuickUpdateVariantDto } from './dto/quick-update-variant.dto';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto';
import { ProductVariantsService } from './product-variants.service';

@ApiTags('Admin Product Variants')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'CONTENT_EDITOR', 'ORDER_MANAGER')
export class ProductVariantsController {
  constructor(private readonly variantsService: ProductVariantsService) {}


  @Get('admin/product-variants')
  @ApiOperation({ summary: 'List product variants for admin' })
  list(@Query() query: ListProductVariantsQueryDto) {
    return this.variantsService.list(query);
  }

  @Get('admin/products/:productId/variants')
  @ApiOperation({ summary: 'List variants by product' })
  @ApiParam({ name: 'productId' })
  listByProduct(
    @Param('productId') productId: string,
    @Query() query: ListProductVariantsQueryDto,
  ) {
    return this.variantsService.listByProduct(productId, query);
  }

  @Post('admin/products/:productId/variants')
  @ApiOperation({ summary: 'Create product variant' })
  @ApiParam({ name: 'productId' })
  create(
    @Param('productId') productId: string,
    @Body() createDto: CreateProductVariantDto,
  ) {
    return this.variantsService.create(productId, createDto);
  }

  @Get('admin/product-variants/:id')
  @ApiOperation({ summary: 'Get product variant detail' })
  @ApiParam({ name: 'id' })
  getById(@Param('id') id: string) {
    return this.variantsService.getById(id);
  }

  @Patch('admin/product-variants/:id')
  @ApiOperation({ summary: 'Update product variant' })
  @ApiParam({ name: 'id' })
  update(@Param('id') id: string, @Body() updateDto: UpdateProductVariantDto) {
    return this.variantsService.update(id, updateDto);
  }

  @Patch('admin/product-variants/:id/quick-update')
  @ApiOperation({ summary: 'Quick update product variant price and quantity' })
  @ApiParam({ name: 'id' })
  quickUpdate(
    @Param('id') id: string,
    @Body() quickUpdateDto: QuickUpdateVariantDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.variantsService.quickUpdate(id, quickUpdateDto, user.id);
  }

  @Delete('admin/product-variants/:id')
  @ApiOperation({ summary: 'Soft delete product variant' })
  @ApiParam({ name: 'id' })
  remove(@Param('id') id: string) {
    return this.variantsService.remove(id);
  }
}
