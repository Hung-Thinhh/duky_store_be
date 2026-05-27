import { PartialType } from '@nestjs/swagger';
import { CreateExternalGalleryDto } from './create-external-gallery.dto';

export class UpdateGalleryDto extends PartialType(CreateExternalGalleryDto) {}
