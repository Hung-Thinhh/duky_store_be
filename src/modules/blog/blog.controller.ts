import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { BlogCategoriesService } from './blog-categories.service';
import { BlogPostsService } from './blog-posts.service';
import { ListBlogPostsQueryDto } from './dto/list-blog-posts-query.dto';

@ApiTags('Blog')
@Controller('blog')
export class BlogController {
  constructor(
    private readonly blogPostsService: BlogPostsService,
    private readonly blogCategoriesService: BlogCategoriesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List published blog posts' })
  listPosts(@Query() query: ListBlogPostsQueryDto) {
    return this.blogPostsService.listPublic(query);
  }

  @Get('categories')
  @ApiOperation({ summary: 'List published blog categories' })
  listCategories() {
    return this.blogCategoriesService.listPublic();
  }

  @Get('categories/:slug')
  @ApiOperation({ summary: 'Get published blog category by slug' })
  @ApiParam({ name: 'slug' })
  getCategoryBySlug(@Param('slug') slug: string) {
    return this.blogCategoriesService.getPublicBySlug(slug);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get published blog post by slug' })
  @ApiParam({ name: 'slug' })
  getPostBySlug(@Param('slug') slug: string) {
    return this.blogPostsService.getPublicBySlug(slug);
  }
}
