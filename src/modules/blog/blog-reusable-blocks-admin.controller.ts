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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-user.type';
import { BlogReusableBlocksService } from './blog-reusable-blocks.service';
import { CreateBlogReusableBlockDto } from './dto/create-blog-reusable-block.dto';
import { ListBlogReusableBlocksQueryDto } from './dto/list-blog-reusable-blocks-query.dto';
import { UpdateBlogReusableBlockDto } from './dto/update-blog-reusable-block.dto';

@ApiTags('Admin Blog Reusable Blocks')
@ApiBearerAuth()
@Controller('admin/blog-reusable-blocks')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'CONTENT_EDITOR')
export class AdminBlogReusableBlocksController {
  constructor(
    private readonly reusableBlocksService: BlogReusableBlocksService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List reusable blog content blocks' })
  list(@Query() query: ListBlogReusableBlocksQueryDto) {
    return this.reusableBlocksService.list(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create reusable blog content block' })
  create(
    @Body() createDto: CreateBlogReusableBlockDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.reusableBlocksService.create(createDto, user?.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get reusable blog content block detail' })
  @ApiParam({ name: 'id' })
  getById(@Param('id') id: string) {
    return this.reusableBlocksService.getById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update reusable blog content block' })
  @ApiParam({ name: 'id' })
  update(
    @Param('id') id: string,
    @Body() updateDto: UpdateBlogReusableBlockDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.reusableBlocksService.update(id, updateDto, user?.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete reusable blog content block' })
  @ApiParam({ name: 'id' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.reusableBlocksService.remove(id, user?.id);
  }
}
