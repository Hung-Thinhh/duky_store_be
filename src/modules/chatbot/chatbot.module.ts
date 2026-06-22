import { Module } from '@nestjs/common';
import { ChatbotController } from './chatbot.controller';
import { ChatbotService } from './chatbot.service';
import { ProductsModule } from '../products/products.module';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [ProductsModule, CategoriesModule],
  controllers: [ChatbotController],
  providers: [ChatbotService],
})
export class ChatbotModule {}
