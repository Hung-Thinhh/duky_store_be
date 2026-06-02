import { Module } from '@nestjs/common';
import { GalleryController } from './gallery.controller';
import { GalleryPublicController } from './gallery-public.controller';
import { GalleryService } from './gallery.service';

@Module({
  controllers: [GalleryController, GalleryPublicController],
  providers: [GalleryService],
  exports: [GalleryService],
})
export class GalleryModule {}
