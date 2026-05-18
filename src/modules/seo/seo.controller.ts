import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RedirectLookupQueryDto } from './dto/redirect-lookup-query.dto';
import { SeoMetadataQueryDto } from './dto/seo-metadata-query.dto';
import { SeoService } from './seo.service';

@ApiTags('SEO')
@Controller()
export class SeoController {
  constructor(private readonly seoService: SeoService) {}

  @Get('seo/metadata')
  @ApiOperation({ summary: 'Get SEO metadata by entity' })
  getMetadata(@Query() query: SeoMetadataQueryDto) {
    return this.seoService.getMetadata(query);
  }

  @Get('seo/redirect')
  @ApiOperation({ summary: 'Resolve active redirect by source path' })
  resolveRedirect(@Query() query: RedirectLookupQueryDto) {
    return this.seoService.resolveRedirect(query.path);
  }

  @Get('sitemap.xml')
  @Header('Content-Type', 'application/xml')
  @ApiOperation({ summary: 'Render sitemap XML' })
  sitemap() {
    return this.seoService.renderSitemap();
  }

  @Get('robots.txt')
  @Header('Content-Type', 'text/plain')
  @ApiOperation({ summary: 'Render robots.txt' })
  robots() {
    return this.seoService.renderRobots();
  }
}
