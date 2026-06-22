import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { CustomerAuthController } from './customer-auth.controller';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerJwtStrategy } from './strategies/customer-jwt.strategy';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PassportModule, JwtModule.register({}), NotificationsModule],
  controllers: [CustomerAuthController],
  providers: [CustomerAuthService, CustomerJwtStrategy],
  exports: [CustomerAuthService],
})
export class CustomerAuthModule {}
