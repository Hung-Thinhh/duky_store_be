import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryChangeType, Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { CreateProductVariantDto } from './dto/create-product-variant.dto';
import { ListProductVariantsQueryDto } from './dto/list-product-variants-query.dto';
import { QuickUpdateVariantDto } from './dto/quick-update-variant.dto';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto';

@Injectable()
export class ProductVariantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  async list(query: ListProductVariantsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildWhere(query);

    const [total, variants] = await this.prisma.$transaction([
      this.prisma.productVariant.count({ where }),
      this.prisma.productVariant.findMany({
        where,
        include: this.variantInclude(),
        orderBy: [{ product: { name: 'asc' } }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: variants.map((variant) => this.toVariant(variant)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async listByProduct(productId: string, query: ListProductVariantsQueryDto) {
    await this.assertProductExists(productId);

    const variants = await this.prisma.productVariant.findMany({
      where: {
        productId,
        deletedAt: null,
        ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      },
      include: this.variantInclude(),
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return { data: variants.map((variant) => this.toVariant(variant)) };
  }

  async create(productId: string, createDto: CreateProductVariantDto) {
    await this.assertProductExists(productId);
    this.assertValidPrice(createDto.price, createDto.salePrice);
    const sku = await this.prepareSku(createDto.sku);

    const variant = await this.prisma.productVariant.create({
      data: {
        productId,
        name: this.nullableTrim(createDto.name),
        sku,
        sizeLabel: this.nullableTrim(createDto.sizeLabel),
        sizeGender: createDto.sizeGender,
        colorName: this.nullableTrim(createDto.colorName),
        colorHex: this.nullableTrim(createDto.colorHex),
        price: createDto.price ?? null,
        salePrice: (createDto.salePrice !== undefined && createDto.salePrice !== null && createDto.salePrice > 0) ? createDto.salePrice : null,
        isActive: createDto.isActive ?? true,
        sortOrder: createDto.sortOrder ?? 0,
        inventory: {
          create: {
            quantity: 0,
            reservedQuantity: 0,
            lowStockThreshold: 3,
            soldOut: true,
          },
        },
      },
      include: this.variantInclude(),
    });

    return this.toVariant(variant);
  }

  async getById(id: string) {
    return this.toVariant(await this.getVariantOrThrow(id));
  }

  async update(id: string, updateDto: UpdateProductVariantDto) {
    const existing = await this.getVariantOrThrow(id);

    if (updateDto.price !== undefined || updateDto.salePrice !== undefined) {
      this.assertValidPrice(
        updateDto.price ?? existing.price ?? undefined,
        updateDto.salePrice === undefined
          ? existing.salePrice
          : updateDto.salePrice,
      );
    }

    const data = await this.buildUpdateData(id, updateDto);

    if (!Object.keys(data).length) {
      throw new BadRequestException('No update data provided');
    }

    const variant = await this.prisma.productVariant.update({
      where: { id },
      data,
      include: this.variantInclude(),
    });

    return this.toVariant(variant);
  }

  async quickUpdate(id: string, dto: QuickUpdateVariantDto, actorId: string) {
    const existing = await this.getVariantOrThrow(id);

    if (dto.price !== undefined || dto.salePrice !== undefined) {
      this.assertValidPrice(
        dto.price ?? existing.price ?? undefined,
        dto.salePrice === undefined
          ? existing.salePrice
          : dto.salePrice,
      );
    }

    const variant = await this.prisma.$transaction(async (tx) => {
      const updateData: Prisma.ProductVariantUncheckedUpdateInput = {};
      if (dto.price !== undefined) {
        updateData.price = dto.price;
      }
      if (dto.salePrice !== undefined) {
        updateData.salePrice = dto.salePrice;
      }

      let updatedVariant = existing;
      if (Object.keys(updateData).length > 0) {
        updatedVariant = await tx.productVariant.update({
          where: { id },
          data: updateData,
          include: this.variantInclude(),
        });
      }

      if (dto.quantity !== undefined) {
        const existingInventory = await tx.inventory.findFirst({
          where: { variantId: id },
        });

        const nextQuantity = dto.quantity;
        if (nextQuantity < 0) {
          throw new BadRequestException('Inventory quantity cannot be negative');
        }

        const savedInventory = existingInventory
          ? await tx.inventory.update({
              where: { id: existingInventory.id },
              data: {
                quantity: nextQuantity,
                soldOut: nextQuantity <= 0,
              },
            })
          : await tx.inventory.create({
              data: {
                productId: existing.productId,
                variantId: id,
                quantity: nextQuantity,
                reservedQuantity: 0,
                lowStockThreshold: 3,
                soldOut: nextQuantity <= 0,
              },
            });

        const previousQuantity = existingInventory?.quantity ?? 0;
        const quantityChange = nextQuantity - previousQuantity;

        await tx.inventoryLog.create({
          data: {
            inventoryId: savedInventory.id,
            productId: existing.productId,
            variantId: id,
            actorId,
            changeType: existingInventory
              ? InventoryChangeType.ADJUST
              : InventoryChangeType.IMPORT,
            quantityBefore: previousQuantity,
            quantityChange,
            quantityAfter: nextQuantity,
            note: dto.note?.trim() || 'Cập nhật nhanh từ trang Chi tiết tồn kho',
          },
        });

        const result = await tx.productVariant.findFirst({
          where: { id },
          include: this.variantInclude(),
        });
        if (!result) {
          throw new NotFoundException('Variant not found');
        }
        updatedVariant = result;
      }

      return updatedVariant;
    });

    return this.toVariant(variant);
  }

  async remove(id: string) {
    await this.getVariantOrThrow(id);
    await this.prisma.productVariant.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });

    return { success: true };
  }

  private async buildUpdateData(
    id: string,
    updateDto: UpdateProductVariantDto,
  ) {
    const data: Prisma.ProductVariantUncheckedUpdateInput = {};

    if (updateDto.name !== undefined) {
      data.name = this.nullableTrim(updateDto.name);
    }

    if (updateDto.sku !== undefined) {
      data.sku = await this.prepareSku(updateDto.sku, id);
    }

    if (updateDto.sizeLabel !== undefined) {
      data.sizeLabel = this.nullableTrim(updateDto.sizeLabel);
    }

    if (updateDto.sizeGender !== undefined) {
      data.sizeGender = updateDto.sizeGender;
    }

    if (updateDto.colorName !== undefined) {
      data.colorName = this.nullableTrim(updateDto.colorName);
    }

    if (updateDto.colorHex !== undefined) {
      data.colorHex = this.nullableTrim(updateDto.colorHex);
    }

    if (updateDto.price !== undefined) {
      data.price = updateDto.price ?? null;
    }

    if (updateDto.salePrice !== undefined) {
      data.salePrice = (updateDto.salePrice !== undefined && updateDto.salePrice !== null && updateDto.salePrice > 0) ? updateDto.salePrice : null;
    }

    if (updateDto.isActive !== undefined) {
      data.isActive = updateDto.isActive;
    }

    if (updateDto.sortOrder !== undefined) {
      data.sortOrder = updateDto.sortOrder;
    }

    return data;
  }

  private buildWhere(query: ListProductVariantsQueryDto): Prisma.ProductVariantWhereInput {
    const search = query.search?.trim();

    return {
      deletedAt: null,
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { sku: { contains: search, mode: 'insensitive' } },
              { sizeLabel: { contains: search, mode: 'insensitive' } },
              { colorName: { contains: search, mode: 'insensitive' } },
              { product: { name: { contains: search, mode: 'insensitive' } } },
              { product: { sku: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
  }

  private assertValidPrice(price?: number | null, salePrice?: number | null) {
    if (price !== undefined && salePrice !== undefined && salePrice !== null) {
      if (price === null) {
        throw new BadRequestException(
          'Variant price is required when sale price is set',
        );
      }

      if (salePrice > price) {
        throw new BadRequestException(
          'Sale price cannot be greater than variant price',
        );
      }
    }
  }

  private async prepareSku(sku: string, id?: string) {
    const normalizedSku = sku.trim();

    if (!normalizedSku) {
      throw new BadRequestException('SKU is required');
    }

    const [existingVariant, existingProduct] = await Promise.all([
      this.prisma.productVariant.findFirst({
        where: {
          sku: normalizedSku,
          deletedAt: null,
          ...(id ? { NOT: { id } } : {}),
        },
        select: { id: true },
      }),
      this.prisma.product.findFirst({
        where: {
          sku: normalizedSku,
          deletedAt: null,
        },
        select: { id: true },
      }),
    ]);

    if (existingVariant || existingProduct) {
      throw new ConflictException('SKU is already used');
    }

    return normalizedSku;
  }

  private async assertProductExists(productId: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        id: productId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }
  }

  private async getVariantOrThrow(id: string) {
    const variant = await this.prisma.productVariant.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: this.variantInclude(),
    });

    if (!variant) {
      throw new NotFoundException('Product variant not found');
    }

    return variant;
  }

  private variantInclude(): Prisma.ProductVariantInclude {
    return {
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      inventory: true,
    };
  }

  private nullableTrim(value?: string | null) {
    return value?.trim() || null;
  }

  private toVariant(
    variant: Prisma.ProductVariantGetPayload<{
      include: ReturnType<ProductVariantsService['variantInclude']>;
    }>,
  ) {
    return {
      id: variant.id,
      productId: variant.productId,
      product: variant.product,
      name: variant.name,
      sku: variant.sku,
      sizeLabel: variant.sizeLabel,
      sizeGender: variant.sizeGender,
      colorName: variant.colorName,
      colorHex: variant.colorHex,
      price: variant.price,
      salePrice: variant.salePrice,
      isActive: variant.isActive,
      sortOrder: variant.sortOrder,
      inventory: variant.inventory,
      createdAt: variant.createdAt,
      updatedAt: variant.updatedAt,
    };
  }
}
