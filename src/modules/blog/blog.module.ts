import { Module } from '@nestjs/common';
import { AdminBlogCategoriesController } from './blog-categories-admin.controller';
import { BlogCategoriesService } from './blog-categories.service';
import { BlogController } from './blog.controller';
import { AdminBlogPostsController } from './blog-posts-admin.controller';
import { BlogPostsService } from './blog-posts.service';

@Module({
  controllers: [
    AdminBlogCategoriesController,
    AdminBlogPostsController,
    BlogController,
  ],
  providers: [BlogCategoriesService, BlogPostsService],
})
export class BlogModule {}
