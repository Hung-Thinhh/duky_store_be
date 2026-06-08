import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  AnalyzeGscUrlsDto,
  GetGscCandidatesQueryDto,
  InspectGscUrlsDto,
  SubmitIndexingDto,
} from './dto/gsc-url.dto';
import { GscService } from './gsc.service';

@ApiTags('Admin Google Search Console')
@ApiBearerAuth()
@Controller('admin/gsc')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'CONTENT_EDITOR')
export class AdminGscController {
  constructor(private readonly gscService: GscService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get SEO indexing overview for dashboard' })
  getOverview() {
    return this.gscService.getOverview();
  }

  @Get('candidates')
  @ApiOperation({ summary: 'Build URL candidates from local SEO data' })
  getCandidates(@Query() queryDto: GetGscCandidatesQueryDto) {
    return this.gscService.getCandidates(queryDto);
  }

  @Post('analyze')
  @ApiOperation({ summary: 'Analyze exported Search Console URLs' })
  analyzeUrls(@Body() analyzeDto: AnalyzeGscUrlsDto) {
    return this.gscService.analyzeUrls(analyzeDto);
  }

  @Post('inspect')
  @ApiOperation({ summary: 'Inspect URLs with Google Search Console API' })
  inspectUrls(@Body() inspectDto: InspectGscUrlsDto) {
    return this.gscService.inspectUrls(inspectDto);
  }

  @Post('submit-indexing')
  @ApiOperation({ summary: 'Submit URL to Google Indexing API' })
  submitIndexing(@Body() submitDto: SubmitIndexingDto) {
    return this.gscService.submitIndexing(submitDto);
  }
}
