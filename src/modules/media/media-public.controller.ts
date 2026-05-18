import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { access } from 'node:fs/promises';
import { join, normalize } from 'node:path';

const LOCAL_MEDIA_FOLDER = join(process.cwd(), 'uploads', 'media');

@ApiTags('Media Files')
@Controller('media/files')
export class MediaPublicController {
  @Get(':fileName')
  @ApiOperation({ summary: 'Serve uploaded local media file' })
  @ApiParam({ name: 'fileName' })
  async getFile(@Param('fileName') fileName: string, @Res() response: Response) {
    const safeFileName = normalize(fileName).replace(/^(\.\.(\/|\\|$))+/, '');
    const filePath = join(LOCAL_MEDIA_FOLDER, safeFileName);

    try {
      await access(filePath);
    } catch {
      throw new NotFoundException('Media file not found');
    }

    return response.sendFile(filePath);
  }
}
