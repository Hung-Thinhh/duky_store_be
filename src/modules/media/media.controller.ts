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
import { CreateExternalMediaDto } from './dto/create-external-media.dto';
import { ListMediaQueryDto } from './dto/list-media-query.dto';
import { SearchMediaAiQueryDto } from './dto/search-media-ai-query.dto';
import { UpdateMediaDto } from './dto/update-media.dto';
import { UploadMediaMetadataDto } from './dto/upload-media-metadata.dto';
import { MediaAiIndexService } from './media-ai-index.service';
import { MediaService } from './media.service';

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const MULTER_OPTIONS = { limits: { fileSize: MAX_IMAGE_SIZE_BYTES } };
const imageUploadPipe = new ParseFilePipe({
  validators: [
    new MaxFileSizeValidator({ maxSize: MAX_IMAGE_SIZE_BYTES }),
    new FileTypeValidator({ fileType: /^image\/(jpeg|png|webp|gif|avif|svg\+xml)$/ }),
  ],
});

@ApiTags('Admin Media')
@ApiBearerAuth()
@Controller('admin/media')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'CONTENT_EDITOR', 'ORDER_MANAGER')
export class MediaController {
  constructor(
    private readonly mediaService: MediaService,
    private readonly mediaAiIndexService: MediaAiIndexService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List media records' })
  list(@Query() query: ListMediaQueryDto) {
    return this.mediaService.list(query);
  }

  @Get('ai-index/search')
  @ApiOperation({ summary: 'Search indexed media candidates for AI workflows' })
  searchAiIndex(@Query() query: SearchMediaAiQueryDto) {
    return this.mediaAiIndexService.search(query.query ?? '', query.limit ?? 20);
  }

  @Post('ai-index/rebuild')
  @ApiOperation({ summary: 'Rebuild AI search index for media metadata' })
  rebuildAiIndex(@Query('limit') limit?: string) {
    return this.mediaAiIndexService.rebuild(Number(limit) || 500);
  }

  @Post('external')
  @ApiOperation({ summary: 'Create media record from external image URL' })
  createExternal(
    @Body() createDto: CreateExternalMediaDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.mediaService.createExternal(createDto, user.id);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', MULTER_OPTIONS))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload one local image file' })
  upload(
    @UploadedFile(imageUploadPipe) file: any,
    @Body() metadata: UploadMediaMetadataDto,
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ) {
    return this.mediaService.createLocal(file, user.id, this.getBaseUrl(request), metadata);
  }

  @Post('upload-multiple')
  @UseInterceptors(FilesInterceptor('files', 20, MULTER_OPTIONS))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload multiple local image files' })
  uploadMultiple(
    @UploadedFiles() files: any[],
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ) {
    return this.mediaService.createLocalMany(files ?? [], user.id, this.getBaseUrl(request));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get media detail' })
  @ApiParam({ name: 'id' })
  getById(@Param('id') id: string) {
    return this.mediaService.getById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update media metadata' })
  @ApiParam({ name: 'id' })
  update(@Param('id') id: string, @Body() updateDto: UpdateMediaDto) {
    return this.mediaService.update(id, updateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete media record' })
  @ApiParam({ name: 'id' })
  remove(@Param('id') id: string) {
    return this.mediaService.remove(id);
  }

  private getBaseUrl(request: Request) {
    return `${request.protocol}://${request.get('host')}`;
  }
}
