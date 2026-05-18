import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ListProductsQueryDto } from '../products/dto/list-products-query.dto';
import { ProductsService } from '../products/products.service';
import { CategoriesService } from './categories.service';

@ApiTags('Categories')
@Controller('categories')
export class CategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly productsService: ProductsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List active categories' })
  listPublic() {
    return this.categoriesService.listPublic();
  }

  @Get(':slug/products')
  @ApiOperation({ summary: 'List published products by category slug' })
  listProductsBySlug(
    @Param('slug') slug: string,
    @Query() query: ListProductsQueryDto,
  ) {
    return this.productsService.listPublic({
      ...query,
      categorySlug: slug,
    });
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get active category by slug' })
  getPublicBySlug(@Param('slug') slug: string) {
    return this.categoriesService.getPublicBySlug(slug);
  }
}
