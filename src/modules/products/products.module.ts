import { Module } from '@nestjs/common';
import { AdminProductsController } from './products-admin.controller';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  controllers: [AdminProductsController, ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
