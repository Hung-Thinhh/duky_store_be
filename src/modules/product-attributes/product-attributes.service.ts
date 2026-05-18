import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateProductAttributeDto } from './dto/create-product-attribute.dto';
import { CreateProductAttributeTermDto } from './dto/create-product-attribute-term.dto';
import { ListProductAttributesQueryDto } from './dto/list-product-attributes-query.dto';
import { UpdateProductAttributeDto } from './dto/update-product-attribute.dto';
import { UpdateProductAttributeTermDto } from './dto/update-product-attribute-term.dto';

@Injectable()
export class ProductAttributesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListProductAttributesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const search = query.search?.trim();
    const where: Prisma.ProductAttributeWhereInput = {
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { slug: { contains: search, mode: 'insensitive' } },
              { terms: { some: { name: { contains: search, mode: 'insensitive' }, deletedAt: null } } },
            ],
          }
        : {}),
    };

    const [total, attributes] = await this.prisma.$transaction([
      this.prisma.productAttribute.count({ where }),
      this.prisma.productAttribute.findMany({
        where,
        include: this.attributeInclude(),
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: attributes.map((attribute) => this.toAttribute(attribute)),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async create(dto: CreateProductAttributeDto) {
    const slug = this.slug(dto.slug);
    await this.assertUniqueSlug(slug);
    const attribute = await this.prisma.productAttribute.create({
      data: {
        name: dto.name.trim(),
        slug,
        type: dto.type,
        sortBy: dto.sortBy?.trim() || 'custom',
        swatch: dto.swatch?.trim() || 'default',
        isVisible: dto.isVisible ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
      include: this.attributeInclude(),
    });
    return this.toAttribute(attribute);
  }

  async update(id: string, dto: UpdateProductAttributeDto) {
    await this.getAttributeOrThrow(id);
    const data: Prisma.ProductAttributeUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.slug !== undefined) {
      const slug = this.slug(dto.slug);
      await this.assertUniqueSlug(slug, id);
      data.slug = slug;
    }
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.sortBy !== undefined) data.sortBy = dto.sortBy.trim() || 'custom';
    if (dto.swatch !== undefined) data.swatch = dto.swatch.trim() || 'default';
    if (dto.isVisible !== undefined) data.isVisible = dto.isVisible;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (!Object.keys(data).length) throw new BadRequestException('No update data provided');
    return this.toAttribute(await this.prisma.productAttribute.update({ where: { id }, data, include: this.attributeInclude() }));
  }

  async remove(id: string) {
    await this.getAttributeOrThrow(id);
    await this.prisma.productAttribute.update({ where: { id }, data: { deletedAt: new Date() } });
    return { success: true };
  }

  async createTerm(attributeId: string, dto: CreateProductAttributeTermDto) {
    await this.getAttributeOrThrow(attributeId);
    const slug = this.slug(dto.slug);
    await this.assertUniqueTermSlug(attributeId, slug);
    return this.prisma.productAttributeTerm.create({
      data: {
        attributeId,
        name: dto.name.trim(),
        slug,
        value: dto.value?.trim() || null,
        metadata: dto.metadata as Prisma.InputJsonValue,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateTerm(id: string, dto: UpdateProductAttributeTermDto) {
    const term = await this.getTermOrThrow(id);
    const data: Prisma.ProductAttributeTermUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.slug !== undefined) {
      const slug = this.slug(dto.slug);
      await this.assertUniqueTermSlug(term.attributeId, slug, id);
      data.slug = slug;
    }
    if (dto.value !== undefined) data.value = dto.value?.trim() || null;
    if (dto.metadata !== undefined) data.metadata = dto.metadata as Prisma.InputJsonValue;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (!Object.keys(data).length) throw new BadRequestException('No update data provided');
    return this.prisma.productAttributeTerm.update({ where: { id }, data });
  }

  async removeTerm(id: string) {
    await this.getTermOrThrow(id);
    await this.prisma.productAttributeTerm.update({ where: { id }, data: { deletedAt: new Date() } });
    return { success: true };
  }

  private attributeInclude(): Prisma.ProductAttributeInclude {
    return { terms: { where: { deletedAt: null }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] } };
  }

  private async getAttributeOrThrow(id: string) {
    const attribute = await this.prisma.productAttribute.findFirst({ where: { id, deletedAt: null }, include: this.attributeInclude() });
    if (!attribute) throw new NotFoundException('Product attribute not found');
    return attribute;
  }

  private async getTermOrThrow(id: string) {
    const term = await this.prisma.productAttributeTerm.findFirst({ where: { id, deletedAt: null } });
    if (!term) throw new NotFoundException('Product attribute term not found');
    return term;
  }

  private async assertUniqueSlug(slug: string, id?: string) {
    const existing = await this.prisma.productAttribute.findFirst({ where: { slug, ...(id ? { NOT: { id } } : {}) }, select: { id: true } });
    if (existing) throw new ConflictException('Attribute slug is already used');
  }

  private async assertUniqueTermSlug(attributeId: string, slug: string, id?: string) {
    const existing = await this.prisma.productAttributeTerm.findFirst({ where: { attributeId, slug, ...(id ? { NOT: { id } } : {}) }, select: { id: true } });
    if (existing) throw new ConflictException('Attribute term slug is already used');
  }

  private slug(value: string) {
    const normalized = value.trim().toLowerCase();
    if (!normalized) throw new BadRequestException('Slug is required');
    return normalized;
  }

  private toAttribute(attribute: Prisma.ProductAttributeGetPayload<{ include: ReturnType<ProductAttributesService['attributeInclude']> }>) {
    return { ...attribute, termsCount: attribute.terms.length };
  }
}
