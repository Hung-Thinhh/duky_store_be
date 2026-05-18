import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { ProductsService } from './products.service';

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'List published products' })
  list(@Query() query: ListProductsQueryDto) {
    return this.productsService.listPublic(query);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get published product by slug' })
  getBySlug(@Param('slug') slug: string) {
    return this.productsService.getPublicBySlug(slug);
  }
}
