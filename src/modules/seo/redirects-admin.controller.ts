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
import { CreateRedirectDto } from './dto/create-redirect.dto';
import { ListRedirectsQueryDto } from './dto/list-redirects-query.dto';
import { UpdateRedirectDto } from './dto/update-redirect.dto';
import { SeoService } from './seo.service';

@ApiTags('Admin Redirects')
@ApiBearerAuth()
@Controller('admin/redirects')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'CONTENT_EDITOR')
export class AdminRedirectsController {
  constructor(private readonly seoService: SeoService) {}

  @Get()
  @ApiOperation({ summary: 'List redirects for admin' })
  list(@Query() query: ListRedirectsQueryDto) {
    return this.seoService.listRedirects(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create redirect' })
  create(@Body() createDto: CreateRedirectDto) {
    return this.seoService.createRedirect(createDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get redirect detail' })
  @ApiParam({ name: 'id' })
  getById(@Param('id') id: string) {
    return this.seoService.getRedirectById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update redirect' })
  @ApiParam({ name: 'id' })
  update(@Param('id') id: string, @Body() updateDto: UpdateRedirectDto) {
    return this.seoService.updateRedirect(id, updateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Disable redirect' })
  @ApiParam({ name: 'id' })
  remove(@Param('id') id: string) {
    return this.seoService.disableRedirect(id);
  }
}
