import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateTagDto } from './dto/create-tag.dto';
import { ListTagsQueryDto } from './dto/list-tags-query.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { TagsService } from './tags.service';

@ApiTags('Admin Tags')
@ApiBearerAuth()
@Controller('admin/tags')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'CONTENT_EDITOR')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Get()
  @ApiOperation({ summary: 'List tags for admin' })
  list(@Query() query: ListTagsQueryDto) {
    return this.tagsService.list(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create tag' })
  create(@Body() createDto: CreateTagDto) {
    return this.tagsService.create(createDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get tag detail' })
  @ApiParam({ name: 'id' })
  getById(@Param('id') id: string) {
    return this.tagsService.getById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update tag' })
  @ApiParam({ name: 'id' })
  update(@Param('id') id: string, @Body() updateDto: UpdateTagDto) {
    return this.tagsService.update(id, updateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete tag' })
  @ApiParam({ name: 'id' })
  remove(@Param('id') id: string) {
    return this.tagsService.remove(id);
  }
}
