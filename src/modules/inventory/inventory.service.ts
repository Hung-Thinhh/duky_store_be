import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryChangeType, Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AdjustInventoryDto } from './dto/adjust-inventory.dto';
import { ListInventoryQueryDto } from './dto/list-inventory-query.dto';
import { UpsertInventoryDto } from './dto/upsert-inventory.dto';

type InventoryWithRelations = Prisma.InventoryGetPayload<{
  include: ReturnType<InventoryService['inventoryInclude']>;
}>;

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListInventoryQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildWhere(query);

    const [total, inventories] = await this.prisma.$transaction([
      this.prisma.inventory.count({ where }),
      this.prisma.inventory.findMany({
        where,
        include: this.inventoryInclude(),
        orderBy: [
          { soldOut: 'desc' },
          { quantity: 'asc' },
          { updatedAt: 'desc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: inventories.map((inventory) => this.toInventory(inventory)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async analytics() {
    const since = new Date();
    since.setDate(since.getDate() - 13);
    since.setHours(0, 0, 0, 0);

    const [inventories, logs] = await this.prisma.$transaction([
      this.prisma.inventory.findMany({
        include: this.analyticsInclude(),
      }),
      this.prisma.inventoryLog.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: 'asc' },
        select: {
          quantityChange: true,
          changeType: true,
          createdAt: true,
        },
      }),
    ]);

    const analyticsInventories = inventories as Array<any>;
    const totalSkus = analyticsInventories.length;
    const totalQuantity = analyticsInventories.reduce(
      (sum, inventory) => sum + inventory.quantity,
      0,
    );
    const reservedQuantity = analyticsInventories.reduce(
      (sum, inventory) => sum + inventory.reservedQuantity,
      0,
    );
    const availableQuantity = totalQuantity - reservedQuantity;
    const soldOutCount = analyticsInventories.filter(
      (inventory) => inventory.quantity <= 0 || inventory.soldOut,
    ).length;
    const lowStockCount = analyticsInventories.filter(
      (inventory) =>
        inventory.quantity > 0 &&
        inventory.quantity <= inventory.lowStockThreshold,
    ).length;
    const healthyCount = Math.max(totalSkus - soldOutCount - lowStockCount, 0);

    const topLowStock = analyticsInventories
      .filter((inventory) => inventory.quantity <= inventory.lowStockThreshold)
      .sort((a, b) => a.quantity - b.quantity)
      .slice(0, 6)
      .map((inventory) => this.toInventorySignal(inventory));

    const topHighStock = [...analyticsInventories]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 6)
      .map((inventory) => this.toInventorySignal(inventory));

    const categoryMap = new Map<
      string,
      { id: string; name: string; quantity: number; skus: number; lowStock: number }
    >();
    const brandMap = new Map<
      string,
      { id: string; name: string; quantity: number; skus: number; lowStock: number }
    >();

    analyticsInventories.forEach((inventory) => {
      const product = inventory.product ?? inventory.variant?.product;
      const isLowStock =
        inventory.quantity <= inventory.lowStockThreshold ? 1 : 0;

      product?.categories.forEach((relation) => {
        const category = relation.category;
        const current =
          categoryMap.get(category.id) ??
          { id: category.id, name: category.name, quantity: 0, skus: 0, lowStock: 0 };
        current.quantity += inventory.quantity;
        current.skus += 1;
        current.lowStock += isLowStock;
        categoryMap.set(category.id, current);
      });

      product?.brands.forEach((relation) => {
        const brand = relation.brand;
        const current =
          brandMap.get(brand.id) ??
          { id: brand.id, name: brand.name, quantity: 0, skus: 0, lowStock: 0 };
        current.quantity += inventory.quantity;
        current.skus += 1;
        current.lowStock += isLowStock;
        brandMap.set(brand.id, current);
      });
    });

    const movementMap = new Map<
      string,
      { date: string; import: number; export: number; adjust: number }
    >();
    for (let index = 0; index < 14; index += 1) {
      const date = new Date(since);
      date.setDate(since.getDate() + index);
      const key = date.toISOString().slice(0, 10);
      movementMap.set(key, { date: key, import: 0, export: 0, adjust: 0 });
    }

    logs.forEach((log) => {
      const key = log.createdAt.toISOString().slice(0, 10);
      const current =
        movementMap.get(key) ?? { date: key, import: 0, export: 0, adjust: 0 };
      if (log.quantityChange > 0) {
        current.import += log.quantityChange;
      } else if (log.quantityChange < 0) {
        current.export += Math.abs(log.quantityChange);
      } else {
        current.adjust += 1;
      }
      movementMap.set(key, current);
    });

    return {
      summary: {
        totalSkus,
        totalQuantity,
        reservedQuantity,
        availableQuantity,
        soldOutCount,
        lowStockCount,
        healthyCount,
        stockHealthRate:
          totalSkus > 0 ? Math.round((healthyCount / totalSkus) * 100) : 0,
      },
      stockHealth: [
        { label: 'Còn ổn', value: healthyCount, color: '#10B981' },
        { label: 'Sắp hết', value: lowStockCount, color: '#F59E0B' },
        { label: 'Hết hàng', value: soldOutCount, color: '#EF4444' },
      ],
      topLowStock,
      topHighStock,
      categories: [...categoryMap.values()]
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 6),
      brands: [...brandMap.values()]
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 6),
      movements: [...movementMap.values()],
    };
  }

  async getById(id: string) {
    return this.toInventory(await this.getInventoryOrThrow(id));
  }

  async getLogs(id: string) {
    await this.getInventoryOrThrow(id);
    const logs = await this.prisma.inventoryLog.findMany({
      where: { inventoryId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return { data: logs };
  }

  async upsertProductInventory(
    productId: string,
    upsertDto: UpsertInventoryDto,
    actorId: string,
  ) {
    await this.assertProductExists(productId);

    const inventory = await this.upsertInventory(
      { productId, variantId: null },
      upsertDto,
      actorId,
    );

    return this.toInventory(inventory);
  }

  async upsertVariantInventory(
    variantId: string,
    upsertDto: UpsertInventoryDto,
    actorId: string,
  ) {
    const variant = await this.getVariantOrThrow(variantId);

    const inventory = await this.upsertInventory(
      { productId: variant.productId, variantId },
      upsertDto,
      actorId,
    );

    return this.toInventory(inventory);
  }

  async adjust(id: string, adjustDto: AdjustInventoryDto, actorId: string) {
    if (adjustDto.quantityChange === 0) {
      throw new BadRequestException('Quantity change cannot be zero');
    }

    const inventory = await this.getInventoryOrThrow(id);
    const quantityAfter = inventory.quantity + adjustDto.quantityChange;

    if (quantityAfter < 0) {
      throw new BadRequestException('Inventory quantity cannot be negative');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.inventory.update({
        where: { id },
        data: {
          quantity: quantityAfter,
          reservedQuantity:
            adjustDto.reservedQuantity ?? inventory.reservedQuantity,
          lowStockThreshold:
            adjustDto.lowStockThreshold ?? inventory.lowStockThreshold,
          soldOut: quantityAfter <= 0,
        },
        include: this.inventoryInclude(),
      });

      await tx.inventoryLog.create({
        data: {
          inventoryId: inventory.id,
          productId: inventory.productId,
          variantId: inventory.variantId,
          actorId,
          changeType: adjustDto.changeType ?? InventoryChangeType.ADJUST,
          quantityBefore: inventory.quantity,
          quantityChange: adjustDto.quantityChange,
          quantityAfter,
          note: this.nullableTrim(adjustDto.note),
        },
      });

      return saved;
    });

    return this.toInventory(updated);
  }

  private async upsertInventory(
    target: { productId: string | null; variantId: string | null },
    upsertDto: UpsertInventoryDto,
    actorId: string,
  ) {
    const existing = await this.prisma.inventory.findFirst({
      where: target.variantId
        ? { variantId: target.variantId }
        : { productId: target.productId },
      include: this.inventoryInclude(),
    });
    const nextQuantity = upsertDto.quantity ?? existing?.quantity ?? 0;

    if (nextQuantity < 0) {
      throw new BadRequestException('Inventory quantity cannot be negative');
    }

    return this.prisma.$transaction(async (tx) => {
      const saved = existing
        ? await tx.inventory.update({
            where: { id: existing.id },
            data: {
              quantity: nextQuantity,
              reservedQuantity:
                upsertDto.reservedQuantity ?? existing.reservedQuantity,
              lowStockThreshold:
                upsertDto.lowStockThreshold ?? existing.lowStockThreshold,
              soldOut: upsertDto.soldOut ?? nextQuantity <= 0,
            },
            include: this.inventoryInclude(),
          })
        : await tx.inventory.create({
            data: {
              productId: target.variantId ? null : target.productId,
              variantId: target.variantId,
              quantity: nextQuantity,
              reservedQuantity: upsertDto.reservedQuantity ?? 0,
              lowStockThreshold: upsertDto.lowStockThreshold ?? 3,
              soldOut: upsertDto.soldOut ?? nextQuantity <= 0,
            },
            include: this.inventoryInclude(),
          });

      const previousQuantity = existing?.quantity ?? 0;
      const quantityChange = nextQuantity - previousQuantity;

      await tx.inventoryLog.create({
        data: {
          inventoryId: saved.id,
          productId: saved.productId,
          variantId: saved.variantId,
          actorId,
          changeType: existing
            ? InventoryChangeType.ADJUST
            : InventoryChangeType.IMPORT,
          quantityBefore: previousQuantity,
          quantityChange,
          quantityAfter: nextQuantity,
          note: this.nullableTrim(upsertDto.note),
        },
      });

      return saved;
    });
  }

  private buildWhere(query: ListInventoryQueryDto): Prisma.InventoryWhereInput {
    const where: Prisma.InventoryWhereInput = {};
    const search = query.search?.trim();

    if (search) {
      where.OR = [
        { product: { name: { contains: search, mode: 'insensitive' } } },
        { product: { sku: { contains: search, mode: 'insensitive' } } },
        { variant: { sku: { contains: search, mode: 'insensitive' } } },
        { variant: { name: { contains: search, mode: 'insensitive' } } },
        {
          variant: {
            product: { name: { contains: search, mode: 'insensitive' } },
          },
        },
        {
          variant: {
            product: { sku: { contains: search, mode: 'insensitive' } },
          },
        },
      ];
    }

    if (query.soldOut !== undefined) {
      where.soldOut = query.soldOut;
    }

    if (query.lowStock === true) {
      where.quantity = { lte: 3 };
    }

    return where;
  }

  private async assertProductExists(productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { id: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }
  }

  private async getVariantOrThrow(variantId: string) {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, deletedAt: null },
      select: { id: true, productId: true },
    });

    if (!variant) {
      throw new NotFoundException('Product variant not found');
    }

    return variant;
  }

  private async getInventoryOrThrow(id: string) {
    const inventory = await this.prisma.inventory.findUnique({
      where: { id },
      include: this.inventoryInclude(),
    });

    if (!inventory) {
      throw new NotFoundException('Inventory not found');
    }

    return inventory;
  }

  private analyticsInclude(): Prisma.InventoryInclude {
    const productSelect = {
      id: true,
      name: true,
      slug: true,
      sku: true,
      categories: {
        select: {
          category: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      brands: {
        select: {
          brand: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    } satisfies Prisma.ProductSelect;

    return {
      product: {
        select: productSelect,
      },
      variant: {
        select: {
          id: true,
          name: true,
          sku: true,
          sizeLabel: true,
          colorName: true,
          product: {
            select: productSelect,
          },
        },
      },
    };
  }

  private inventoryInclude(): Prisma.InventoryInclude {
    return {
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          sku: true,
        },
      },
      variant: {
        select: {
          id: true,
          name: true,
          sku: true,
          sizeLabel: true,
          sizeGender: true,
          colorName: true,
          colorHex: true,
          isActive: true,
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              sku: true,
            },
          },
        },
      },
      _count: {
        select: {
          logs: true,
        },
      },
    };
  }

  private nullableTrim(value?: string | null) {
    return value?.trim() || null;
  }

  private toInventorySignal(inventory: any) {
    const product = inventory.product ?? inventory.variant?.product;
    const variantName =
      inventory.variant?.name ??
      [inventory.variant?.sizeLabel, inventory.variant?.colorName]
        .filter(Boolean)
        .join(' - ');

    return {
      id: inventory.id,
      productName: product?.name ?? 'Không rõ sản phẩm',
      variantName: variantName || null,
      sku: inventory.variant?.sku ?? product?.sku ?? '',
      quantity: inventory.quantity,
      threshold: inventory.lowStockThreshold,
      reservedQuantity: inventory.reservedQuantity,
      availableQuantity: inventory.quantity - inventory.reservedQuantity,
      updatedAt: inventory.updatedAt,
    };
  }

  private toInventory(inventory: InventoryWithRelations) {
    return {
      id: inventory.id,
      productId: inventory.productId,
      variantId: inventory.variantId,
      product: inventory.product,
      variant: inventory.variant,
      quantity: inventory.quantity,
      reservedQuantity: inventory.reservedQuantity,
      availableQuantity: inventory.quantity - inventory.reservedQuantity,
      lowStockThreshold: inventory.lowStockThreshold,
      isLowStock: inventory.quantity <= inventory.lowStockThreshold,
      soldOut: inventory.soldOut,
      logsCount: inventory._count.logs,
      createdAt: inventory.createdAt,
      updatedAt: inventory.updatedAt,
    };
  }
}
