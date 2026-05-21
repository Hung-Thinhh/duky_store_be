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
import { UpdateMediaDto } from './dto/update-media.dto';
import { UploadMediaMetadataDto } from './dto/upload-media-metadata.dto';
import { MediaService } from './media.service';

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
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
@Roles('SUPER_ADMIN', 'ADMIN', 'CONTENT_EDITOR')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get()
  @ApiOperation({ summary: 'List media records' })
  list(@Query() query: ListMediaQueryDto) {
    return this.mediaService.list(query);
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
  @UseInterceptors(FileInterceptor('file'))
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
  @UseInterceptors(FilesInterceptor('files', 20))
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
