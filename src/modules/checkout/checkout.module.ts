import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { FacebookCapiModule } from '../facebook-capi/facebook-capi.module';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';

@Module({
  imports: [NotificationsModule, FacebookCapiModule],
  controllers: [CheckoutController],
  providers: [CheckoutService],
})
export class CheckoutModule {}
