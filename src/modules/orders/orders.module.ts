import { Module } from '@nestjs/common';
import { AdminOrdersController } from './orders-admin.controller';
import { OrdersService } from './orders.service';

@Module({
  controllers: [AdminOrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
