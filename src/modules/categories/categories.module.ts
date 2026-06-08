import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { AdminCategoriesController } from './categories-admin.controller';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { SeoModule } from '../seo/seo.module';

@Module({
  imports: [ProductsModule, SeoModule],
  controllers: [AdminCategoriesController, CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
