import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './database/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { BlogModule } from './modules/blog/blog.module';
import { CartModule } from './modules/cart/cart.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { CheckoutModule } from './modules/checkout/checkout.module';
import { CustomerAuthModule } from './modules/customer-auth/customer-auth.module';
import { CustomersModule } from './modules/customers/customers.module';
import { HomepageModule } from './modules/homepage/homepage.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { MediaModule } from './modules/media/media.module';
import { GalleryModule } from './modules/gallery/gallery.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrdersModule } from './modules/orders/orders.module';
import { ProductVariantsModule } from './modules/product-variants/product-variants.module';
import { ProductAttributesModule } from './modules/product-attributes/product-attributes.module';
import { ProductsModule } from './modules/products/products.module';
import { SeoModule } from './modules/seo/seo.module';
import { SettingsModule } from './modules/settings/settings.module';
import { TagsModule } from './modules/tags/tags.module';
import { UsersModule } from './modules/users/users.module';
import { ChatbotModule } from './modules/chatbot/chatbot.module';
import { FacebookCapiModule } from './modules/facebook-capi/facebook-capi.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
    }),
    PrismaModule,
    AuthModule,
    BlogModule,
    CartModule,
    CheckoutModule,
    CustomerAuthModule,
    OrdersModule,
    CustomersModule,
    NotificationsModule,
    HomepageModule,
    SettingsModule,
    UsersModule,
    CategoriesModule,
    TagsModule,
    MediaModule,
    GalleryModule,
    ProductsModule,
    SeoModule,
    ProductAttributesModule,
    ProductVariantsModule,
    InventoryModule,
    ChatbotModule,
    FacebookCapiModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
