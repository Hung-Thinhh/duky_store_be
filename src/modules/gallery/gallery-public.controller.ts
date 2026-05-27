import { Controller, Get, NotFoundException, Param, Res, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { access } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { GalleryService } from './gallery.service';
import { PublicGalleryQueryDto } from './dto/public-gallery-query.dto';

const LOCAL_GALLERY_FOLDER = join(process.cwd(), 'uploads', 'gallery');

@ApiTags('Public Gallery')
@Controller('gallery')
export class GalleryPublicController {
  constructor(private readonly galleryService: GalleryService) {}

  @Get()
  @ApiOperation({ summary: 'Get lookbook gallery images' })
  async getPublicImages(@Query() query: PublicGalleryQueryDto) {
    return this.galleryService.listPublic(query.forMale);
  }

  @Get('files/:fileName')
  @ApiOperation({ summary: 'Serve uploaded local gallery file' })
  @ApiParam({ name: 'fileName' })
  async getFile(@Param('fileName') fileName: string, @Res() response: Response) {
    const safeFileName = normalize(fileName).replace(/^(\.\.(\/|\\|$))+/, '');
    const filePath = join(LOCAL_GALLERY_FOLDER, safeFileName);

    try {
      await access(filePath);
    } catch {
      throw new NotFoundException('Gallery image file not found');
    }

    return response.sendFile(filePath);
  }
}
