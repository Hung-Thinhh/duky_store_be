import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { AdminBlogAiController } from './blog-ai-admin.controller';
import { BlogAiService } from './blog-ai.service';
import { AdminBlogCategoriesController } from './blog-categories-admin.controller';
import { BlogCategoriesService } from './blog-categories.service';
import { BlogController } from './blog.controller';
import { AdminBlogPostsController } from './blog-posts-admin.controller';
import { BlogPostsService } from './blog-posts.service';
import { AdminBlogReusableBlocksController } from './blog-reusable-blocks-admin.controller';
import { BlogReusableBlocksService } from './blog-reusable-blocks.service';
import { SeoModule } from '../seo/seo.module';

@Module({
  imports: [MediaModule, SeoModule],
  controllers: [
    AdminBlogAiController,
    AdminBlogCategoriesController,
    AdminBlogPostsController,
    AdminBlogReusableBlocksController,
    BlogController,
  ],
  providers: [
    BlogAiService,
    BlogCategoriesService,
    BlogPostsService,
    BlogReusableBlocksService,
  ],
})
export class BlogModule {}
