import { PartialType } from '@nestjs/swagger';
import { CreateHomepageItemDto } from './create-homepage-item.dto';

export class UpdateHomepageItemDto extends PartialType(CreateHomepageItemDto) {}
