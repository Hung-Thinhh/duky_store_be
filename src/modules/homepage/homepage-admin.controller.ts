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
import { CreateHomepageItemDto } from './dto/create-homepage-item.dto';
import { CreateHomepageSectionDto } from './dto/create-homepage-section.dto';
import { ListHomepageSectionsQueryDto } from './dto/list-homepage-sections-query.dto';
import { UpdateHomepageItemDto } from './dto/update-homepage-item.dto';
import { UpdateHomepageSectionDto } from './dto/update-homepage-section.dto';
import { HomepageService } from './homepage.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/types/auth-user.type';

@ApiTags('Admin Homepage')
@ApiBearerAuth()
@Controller('admin/homepage')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'CONTENT_EDITOR')
export class AdminHomepageController {
  constructor(private readonly homepageService: HomepageService) {}

  @Get('sections')
  @ApiOperation({ summary: 'List homepage sections for admin' })
  listSections(@Query() query: ListHomepageSectionsQueryDto) {
    return this.homepageService.listAdmin(query);
  }

  @Post('sections')
  @ApiOperation({ summary: 'Create homepage section' })
  createSection(@Body() createDto: CreateHomepageSectionDto) {
    return this.homepageService.createSection(createDto);
  }

  @Get('sections/:id')
  @ApiOperation({ summary: 'Get homepage section detail' })
  @ApiParam({ name: 'id' })
  getSection(@Param('id') id: string) {
    return this.homepageService.getSectionById(id);
  }

  @Patch('sections/:id')
  @ApiOperation({ summary: 'Update homepage section' })
  @ApiParam({ name: 'id' })
  updateSection(
    @Param('id') id: string,
    @Body() updateDto: UpdateHomepageSectionDto,
  ) {
    return this.homepageService.updateSection(id, updateDto);
  }

  @Delete('sections/:id')
  @ApiOperation({ summary: 'Delete homepage section' })
  @ApiParam({ name: 'id' })
  removeSection(@Param('id') id: string) {
    return this.homepageService.removeSection(id);
  }

  @Post('sections/:id/items')
  @ApiOperation({ summary: 'Create homepage item in section' })
  @ApiParam({ name: 'id' })
  createItem(
    @Param('id') id: string,
    @Body() createDto: CreateHomepageItemDto,
  ) {
    return this.homepageService.createItem(id, createDto);
  }

  @Patch('items/:id')
  @ApiOperation({ summary: 'Update homepage item' })
  @ApiParam({ name: 'id' })
  updateItem(
    @Param('id') id: string,
    @Body() updateDto: UpdateHomepageItemDto,
  ) {
    return this.homepageService.updateItem(id, updateDto);
  }

  @Delete('items/:id')
  @ApiOperation({ summary: 'Delete homepage item' })
  @ApiParam({ name: 'id' })
  removeItem(@Param('id') id: string) {
    return this.homepageService.removeItem(id);
  }

  @Post('sections/:id/heartbeat')
  @ApiOperation({ summary: 'Register heartbeat for editing a section' })
  @ApiParam({ name: 'id' })
  registerHeartbeat(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    this.homepageService.registerHeartbeat(id, user);
    return { success: true };
  }

  @Get('active-editors')
  @ApiOperation({ summary: 'Get all active editors' })
  getActiveEditors() {
    return this.homepageService.getActiveEditors();
  }
}
