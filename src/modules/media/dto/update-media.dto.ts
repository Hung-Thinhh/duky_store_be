import { PartialType } from '@nestjs/swagger';
import { CreateExternalMediaDto } from './create-external-media.dto';

export class UpdateMediaDto extends PartialType(CreateExternalMediaDto) {}
