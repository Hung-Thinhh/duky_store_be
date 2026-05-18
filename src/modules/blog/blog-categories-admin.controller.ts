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
import { BlogCategoriesService } from './blog-categories.service';
import { CreateBlogCategoryDto } from './dto/create-blog-category.dto';
import { ListBlogCategoriesQueryDto } from './dto/list-blog-categories-query.dto';
import { UpdateBlogCategoryDto } from './dto/update-blog-category.dto';

@ApiTags('Admin Blog Categories')
@ApiBearerAuth()
@Controller('admin/blog-categories')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'CONTENT_EDITOR')
export class AdminBlogCategoriesController {
  constructor(private readonly blogCategoriesService: BlogCategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'List blog categories for admin' })
  list(@Query() query: ListBlogCategoriesQueryDto) {
    return this.blogCategoriesService.listAdmin(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create blog category' })
  create(@Body() createDto: CreateBlogCategoryDto) {
    return this.blogCategoriesService.create(createDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get blog category detail for admin' })
  @ApiParam({ name: 'id' })
  getById(@Param('id') id: string) {
    return this.blogCategoriesService.getById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update blog category' })
  @ApiParam({ name: 'id' })
  update(
    @Param('id') id: string,
    @Body() updateDto: UpdateBlogCategoryDto,
  ) {
    return this.blogCategoriesService.update(id, updateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete blog category' })
  @ApiParam({ name: 'id' })
  remove(@Param('id') id: string) {
    return this.blogCategoriesService.remove(id);
  }
}
