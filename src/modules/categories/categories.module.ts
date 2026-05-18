import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { AdminCategoriesController } from './categories-admin.controller';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

@Module({
  imports: [ProductsModule],
  controllers: [AdminCategoriesController, CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
