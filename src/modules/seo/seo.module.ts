import { Module } from '@nestjs/common';
import { AdminRedirectsController } from './redirects-admin.controller';
import { SeoController } from './seo.controller';
import { SeoService } from './seo.service';

@Module({
  controllers: [SeoController, AdminRedirectsController],
  providers: [SeoService],
})
export class SeoModule {}
