import { Module } from '@nestjs/common';
import { AdminProductsController } from './products-admin.controller';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { AdminProductAiController } from './product-ai-admin.controller';
import { ProductAiService } from './product-ai.service';
import { SettingsModule } from '../settings/settings.module';
import { SeoModule } from '../seo/seo.module';

@Module({
  imports: [SettingsModule, SeoModule],
  controllers: [AdminProductsController, ProductsController, AdminProductAiController],
  providers: [ProductsService, ProductAiService],
  exports: [ProductsService, ProductAiService],
})
export class ProductsModule {}
