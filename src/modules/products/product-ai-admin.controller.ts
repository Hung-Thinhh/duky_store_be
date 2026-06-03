import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProductAiService } from './product-ai.service';
import { ProductAiAssistDto } from './dto/product-ai-assist.dto';

@ApiTags('Admin Product AI')
@ApiBearerAuth()
@Controller('admin/product-ai')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'CONTENT_EDITOR')
export class AdminProductAiController {
  constructor(private readonly productAiService: ProductAiService) {}

  @Post('assist')
  @ApiOperation({ summary: 'Generate AI suggestions for product SEO and description' })
  assist(@Body() assistDto: ProductAiAssistDto) {
    return this.productAiService.assist(assistDto);
  }
}
