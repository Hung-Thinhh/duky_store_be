import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateKeywordPlanDto, UpdateKeywordPlanDto } from './dto/keyword-plan.dto';
import { SeoService } from './seo.service';

@ApiTags('Admin Keyword Plans')
@ApiBearerAuth()
@Controller('admin/keyword-plans')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'CONTENT_EDITOR')
export class AdminKeywordPlansController {
  constructor(private readonly seoService: SeoService) {}

  @Get()
  @ApiOperation({ summary: 'List keyword plans' })
  list() {
    return this.seoService.listKeywordPlans();
  }

  @Get('focus-keywords')
  @ApiOperation({ summary: 'List all focus keywords of products and blog posts' })
  listFocusKeywords() {
    return this.seoService.listFocusKeywords();
  }

  @Post()
  @ApiOperation({ summary: 'Create keyword plan' })
  create(@Body() createDto: CreateKeywordPlanDto) {
    return this.seoService.createKeywordPlan(createDto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update keyword plan' })
  @ApiParam({ name: 'id' })
  update(@Param('id') id: string, @Body() updateDto: UpdateKeywordPlanDto) {
    return this.seoService.updateKeywordPlan(id, updateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete keyword plan' })
  @ApiParam({ name: 'id' })
  remove(@Param('id') id: string) {
    return this.seoService.deleteKeywordPlan(id);
  }
}
