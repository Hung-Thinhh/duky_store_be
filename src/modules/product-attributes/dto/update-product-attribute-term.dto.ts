import { PartialType } from '@nestjs/swagger';
import { CreateProductAttributeTermDto } from './create-product-attribute-term.dto';

export class UpdateProductAttributeTermDto extends PartialType(CreateProductAttributeTermDto) {}
