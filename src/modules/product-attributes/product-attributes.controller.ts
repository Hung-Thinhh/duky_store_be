import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateProductAttributeDto } from './dto/create-product-attribute.dto';
import { CreateProductAttributeTermDto } from './dto/create-product-attribute-term.dto';
import { ListProductAttributesQueryDto } from './dto/list-product-attributes-query.dto';
import { UpdateProductAttributeDto } from './dto/update-product-attribute.dto';
import { UpdateProductAttributeTermDto } from './dto/update-product-attribute-term.dto';
import { ProductAttributesService } from './product-attributes.service';

@ApiTags('Admin Product Attributes')
@ApiBearerAuth()
@Controller('admin/product-attributes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'CONTENT_EDITOR')
export class ProductAttributesController {
  constructor(private readonly attributesService: ProductAttributesService) {}

  @Get()
  @ApiOperation({ summary: 'List global product attributes' })
  list(@Query() query: ListProductAttributesQueryDto) {
    return this.attributesService.list(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create global product attribute' })
  create(@Body() dto: CreateProductAttributeDto) {
    return this.attributesService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update global product attribute' })
  @ApiParam({ name: 'id' })
  update(@Param('id') id: string, @Body() dto: UpdateProductAttributeDto) {
    return this.attributesService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete global product attribute' })
  @ApiParam({ name: 'id' })
  remove(@Param('id') id: string) {
    return this.attributesService.remove(id);
  }

  @Post(':id/terms')
  @ApiOperation({ summary: 'Create attribute term' })
  @ApiParam({ name: 'id' })
  createTerm(@Param('id') id: string, @Body() dto: CreateProductAttributeTermDto) {
    return this.attributesService.createTerm(id, dto);
  }

  @Patch('terms/:termId')
  @ApiOperation({ summary: 'Update attribute term' })
  @ApiParam({ name: 'termId' })
  updateTerm(@Param('termId') termId: string, @Body() dto: UpdateProductAttributeTermDto) {
    return this.attributesService.updateTerm(termId, dto);
  }

  @Delete('terms/:termId')
  @ApiOperation({ summary: 'Delete attribute term' })
  @ApiParam({ name: 'termId' })
  removeTerm(@Param('termId') termId: string) {
    return this.attributesService.removeTerm(termId);
  }
}
