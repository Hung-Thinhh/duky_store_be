import { Module } from '@nestjs/common';
import { AdminHomepageController } from './homepage-admin.controller';
import { HomepageController } from './homepage.controller';
import { HomepageService } from './homepage.service';

@Module({
  controllers: [HomepageController, AdminHomepageController],
  providers: [HomepageService],
})
export class HomepageModule {}
