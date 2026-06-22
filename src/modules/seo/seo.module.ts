import { Module } from '@nestjs/common';
import { AdminGscController } from './gsc-admin.controller';
import { GscService } from './gsc.service';
import { AdminKeywordPlansController } from './keyword-plans-admin.controller';
import { AdminRedirectsController } from './redirects-admin.controller';
import { SeoController } from './seo.controller';
import { SeoService } from './seo.service';

@Module({
  controllers: [
    SeoController,
    AdminRedirectsController,
    AdminGscController,
    AdminKeywordPlansController,
  ],
  providers: [SeoService, GscService],
  exports: [GscService],
})
export class SeoModule {}
