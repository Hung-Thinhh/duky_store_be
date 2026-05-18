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
import { BlogPostsService } from './blog-posts.service';
import { CreateBlogPostDto } from './dto/create-blog-post.dto';
import { ListBlogPostsQueryDto } from './dto/list-blog-posts-query.dto';
import { UpdateBlogPostDto } from './dto/update-blog-post.dto';

@ApiTags('Admin Blog Posts')
@ApiBearerAuth()
@Controller('admin/blog-posts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'CONTENT_EDITOR')
export class AdminBlogPostsController {
  constructor(private readonly blogPostsService: BlogPostsService) {}

  @Get()
  @ApiOperation({ summary: 'List blog posts for admin' })
  list(@Query() query: ListBlogPostsQueryDto) {
    return this.blogPostsService.listAdmin(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create blog post' })
  create(@Body() createDto: CreateBlogPostDto, @CurrentUser() user: AuthUser) {
    return this.blogPostsService.create(createDto, user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get blog post detail for admin' })
  @ApiParam({ name: 'id' })
  getById(@Param('id') id: string) {
    return this.blogPostsService.getById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update blog post' })
  @ApiParam({ name: 'id' })
  update(@Param('id') id: string, @Body() updateDto: UpdateBlogPostDto) {
    return this.blogPostsService.update(id, updateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete blog post' })
  @ApiParam({ name: 'id' })
  remove(@Param('id') id: string) {
    return this.blogPostsService.remove(id);
  }
}
