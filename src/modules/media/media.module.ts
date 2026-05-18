import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaPublicController } from './media-public.controller';
import { MediaService } from './media.service';

@Module({
  controllers: [MediaController, MediaPublicController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
