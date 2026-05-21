import { Module } from '@nestjs/common';
import { AdminBlogCategoriesController } from './blog-categories-admin.controller';
import { BlogCategoriesService } from './blog-categories.service';
import { BlogController } from './blog.controller';
import { AdminBlogPostsController } from './blog-posts-admin.controller';
import { BlogPostsService } from './blog-posts.service';
import { AdminBlogReusableBlocksController } from './blog-reusable-blocks-admin.controller';
import { BlogReusableBlocksService } from './blog-reusable-blocks.service';

@Module({
  controllers: [
    AdminBlogCategoriesController,
    AdminBlogPostsController,
    AdminBlogReusableBlocksController,
    BlogController,
  ],
  providers: [
    BlogCategoriesService,
    BlogPostsService,
    BlogReusableBlocksService,
  ],
})
export class BlogModule {}
