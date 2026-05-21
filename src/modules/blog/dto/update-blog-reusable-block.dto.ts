import { PartialType } from '@nestjs/swagger';
import { CreateBlogReusableBlockDto } from './create-blog-reusable-block.dto';

export class UpdateBlogReusableBlockDto extends PartialType(
  CreateBlogReusableBlockDto,
) {}
