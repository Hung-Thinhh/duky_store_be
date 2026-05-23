import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BlogAiService } from './blog-ai.service';
import { BlogAiAssistDto, BlogAiBlockAssistDto } from './dto/blog-ai-assist.dto';

@ApiTags('Admin Blog AI')
@ApiBearerAuth()
@Controller('admin/blog-ai')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'CONTENT_EDITOR')
export class AdminBlogAiController {
  constructor(private readonly blogAiService: BlogAiService) {}

  @Post('assist')
  @ApiOperation({ summary: 'Generate AI suggestions for blog authoring' })
  assist(@Body() assistDto: BlogAiAssistDto) {
    return this.blogAiService.assist(assistDto);
  }

  @Post('block-assist')
  @ApiOperation({ summary: 'Ask AI about or rewrite one blog editor block' })
  assistBlock(@Body() assistDto: BlogAiBlockAssistDto) {
    return this.blogAiService.assistBlock(assistDto);
  }
}
