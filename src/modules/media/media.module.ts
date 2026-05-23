import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaPublicController } from './media-public.controller';
import { MediaAiIndexService } from './media-ai-index.service';
import { MediaService } from './media.service';

@Module({
  controllers: [MediaController, MediaPublicController],
  providers: [MediaAiIndexService, MediaService],
  exports: [MediaAiIndexService, MediaService],
})
export class MediaModule {}
