import {
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  Get,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-user.type';
import { CreateExternalGalleryDto } from './dto/create-external-gallery.dto';
import { ListGalleryQueryDto } from './dto/list-gallery-query.dto';
import { UpdateGalleryDto } from './dto/update-gallery.dto';
import { UploadGalleryMetadataDto } from './dto/upload-gallery-metadata.dto';
import { GalleryService } from './gallery.service';

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const imageUploadPipe = new ParseFilePipe({
  validators: [
    new MaxFileSizeValidator({ maxSize: MAX_IMAGE_SIZE_BYTES }),
    new FileTypeValidator({ fileType: /^image\/(jpeg|png|webp|gif|avif|svg\+xml)$/ }),
  ],
});

@ApiTags('Admin Gallery')
@ApiBearerAuth()
@Controller('admin/gallery')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'CONTENT_EDITOR')
export class GalleryController {
  constructor(private readonly galleryService: GalleryService) {}

  @Get()
  @ApiOperation({ summary: 'List gallery image records' })
  list(@Query() query: ListGalleryQueryDto) {
    return this.galleryService.list(query);
  }

  @Post('external')
  @ApiOperation({ summary: 'Create gallery image record from external URL' })
  createExternal(
    @Body() createDto: CreateExternalGalleryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.galleryService.createExternal(createDto, user.id);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload one local gallery image' })
  upload(
    @UploadedFile(imageUploadPipe) file: any,
    @Body() metadata: UploadGalleryMetadataDto,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ) {
    return this.galleryService.createLocal(file, user.id, this.getBaseUrl(request), metadata);
  }

  @Post('upload-multiple')
  @UseInterceptors(FilesInterceptor('files', 20))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload multiple local gallery images' })
  uploadMultiple(
    @UploadedFiles() files: any[],
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ) {
    return this.galleryService.createLocalMany(files ?? [], user.id, this.getBaseUrl(request));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get gallery image detail' })
  @ApiParam({ name: 'id' })
  getById(@Param('id') id: string) {
    return this.galleryService.getById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update gallery image metadata' })
  @ApiParam({ name: 'id' })
  update(@Param('id') id: string, @Body() updateDto: UpdateGalleryDto) {
    return this.galleryService.update(id, updateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete gallery image record' })
  @ApiParam({ name: 'id' })
  remove(@Param('id') id: string) {
    return this.galleryService.remove(id);
  }

  private getBaseUrl(request: Request) {
    return `${request.protocol}://${request.get('host')}`;
  }
}
