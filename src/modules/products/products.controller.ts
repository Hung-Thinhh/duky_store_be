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

  @Get(':slug/recommendations')
  @ApiOperation({ summary: 'Get product recommendations by slug' })
  getRecommendations(
    @Param('slug') slug: string,
    @Query('limit') limit?: number,
  ) {
    return this.productsService.getRecommendationsBySlug(slug, limit);
  }

  @Get(':slug/variants')
  @ApiOperation({ summary: 'List active variants for published product by slug' })
  listVariantsBySlug(@Param('slug') slug: string) {
    return this.productsService.listPublicVariantsBySlug(slug);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get published product by slug' })
  getBySlug(@Param('slug') slug: string) {
    return this.productsService.getPublicBySlug(slug);
  }
}
