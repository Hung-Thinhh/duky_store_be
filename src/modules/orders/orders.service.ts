import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryChangeType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  ProductStatus,
  ShippingStatus,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  AdminOrderSource,
  CreateAdminOrderDto,
} from './dto/create-admin-order.dto';
import { ListAdminOrdersQueryDto } from './dto/list-admin-orders-query.dto';
import { UpdateOrderNoteDto } from './dto/update-order-note.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async listAdmin(query: ListAdminOrdersQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildAdminWhere(query);

    const [total, orders] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: this.orderListInclude(),
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: orders.map((order) => this.toAdminOrder(order)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getById(id: string) {
    const order = await this.findOrderById(id);

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return this.toAdminOrder(order);
  }

  async createAdmin(createDto: CreateAdminOrderDto, actorId: string) {
    const order = await this.prisma.$transaction(async (tx) => {
      const normalizedItems = await Promise.all(
        createDto.items.map(async (item) => {
          const product = await tx.product.findFirst({
            where: {
              id: item.productId,
              deletedAt: null,
              status: { not: ProductStatus.DISCONTINUED },
            },
            include: {
              inventory: true,
              variants: {
                where: {
                  deletedAt: null,
                  ...(item.variantId ? { id: item.variantId } : {}),
                },
                include: { inventory: true },
              },
            },
          });

          if (!product) {
            throw new BadRequestException('Product is not available');
          }

          const variant = item.variantId
            ? product.variants.find((candidate) => candidate.id === item.variantId)
            : null;

          if (item.variantId && (!variant || !variant.isActive)) {
            throw new BadRequestException(`Variant is not available for ${product.name}`);
          }

          const rawInventory = variant?.inventory ?? product.inventory;

          if (!rawInventory || rawInventory.soldOut) {
            throw new BadRequestException(`Product ${product.name} is out of stock`);
          }

          // Re-fetch inventory with pessimistic lock
          const [lockedInventory] = await tx.$queryRaw<
            { id: string; quantity: number; reservedQuantity: number; soldOut: boolean }[]
          >`
            SELECT id, quantity, "reservedQuantity", "soldOut"
            FROM inventories
            WHERE id = ${rawInventory.id}
            FOR UPDATE
          `;

          if (!lockedInventory || lockedInventory.soldOut) {
            throw new BadRequestException(`Product ${product.name} is out of stock`);
          }

          const availableQuantity = lockedInventory.quantity - lockedInventory.reservedQuantity;

          if (item.quantity > availableQuantity) {
            throw new BadRequestException(
              `Requested quantity exceeds stock for ${product.name}`,
            );
          }

          const unitPrice =
            variant?.salePrice ??
            variant?.price ??
            product.salePrice ??
            product.originalPrice;
          const variantLabel = [
            variant?.sizeLabel ? `Size: ${variant.sizeLabel}` : null,
            variant?.colorName ? `Màu: ${variant.colorName}` : null,
          ]
            .filter((value): value is string => Boolean(value))
            .join(' - ');
          const variantName = variantLabel || variant?.name || null;

          return {
            product,
            variant,
            inventory: lockedInventory,
            quantity: item.quantity,
            unitPrice,
            lineTotal: unitPrice * item.quantity,
            variantName,
          };
        }),
      );

      const subtotal = normalizedItems.reduce(
        (sum, item) => sum + item.lineTotal,
        0,
      );
      const discountTotal = createDto.discountAmount ?? 0;
      const shippingFee =
        createDto.source === AdminOrderSource.DIRECT
          ? 0
          : createDto.shippingFee ?? 0;
      const grandTotal = Math.max(0, subtotal - discountTotal + shippingFee);
      const isDirect = createDto.source === AdminOrderSource.DIRECT;
      const customer = await this.findOrCreateCustomer(tx, createDto);
      const created = await tx.order.create({
        data: {
          code: await this.createOrderCode(tx),
          customerId: customer.id,
          status: isDirect ? OrderStatus.COMPLETED : OrderStatus.PENDING,
          paymentStatus: isDirect ? PaymentStatus.PAID : PaymentStatus.UNPAID,
          shippingStatus: isDirect
            ? ShippingStatus.DELIVERED
            : ShippingStatus.NOT_SHIPPED,
          customerName: createDto.customerName.trim(),
          customerPhone: createDto.customerPhone.trim(),
          customerEmail: this.nullableTrim(createDto.customerEmail),
          subtotal,
          discountTotal,
          shippingFee,
          grandTotal,
          customerNote: this.nullableTrim(createDto.customerNote),
          internalNote: this.nullableTrim(createDto.internalNote),
          source: isDirect ? 'manual_direct' : 'manual_online',
          confirmedAt: isDirect ? new Date() : null,
          completedAt: isDirect ? new Date() : null,
        },
      });

      await tx.shippingAddress.create({
        data: {
          orderId: created.id,
          fullName: createDto.customerName.trim(),
          phone: createDto.customerPhone.trim(),
          addressLine: createDto.addressLine.trim(),
          ward: this.nullableTrim(createDto.ward),
          district: this.nullableTrim(createDto.district),
          province: this.nullableTrim(createDto.province),
          country: createDto.country?.trim() || 'VN',
        },
      });

      await tx.payment.create({
        data: {
          orderId: created.id,
          method: createDto.paymentMethod,
          status: isDirect ? PaymentStatus.PAID : PaymentStatus.UNPAID,
          amount: grandTotal,
          confirmedById: isDirect ? actorId : null,
          paidAt: isDirect ? new Date() : null,
        },
      });

      await tx.shipment.create({
        data: {
          orderId: created.id,
          status: isDirect
            ? ShippingStatus.DELIVERED
            : ShippingStatus.NOT_SHIPPED,
          shippingFee,
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: created.id,
          toStatus: isDirect ? OrderStatus.COMPLETED : OrderStatus.PENDING,
          actorId,
          note: isDirect
            ? 'Manual direct order created from admin'
            : 'Manual online order created from admin',
        },
      });

      // Sort by inventory ID to prevent deadlocks
      const sortedItems = [...normalizedItems].sort((a, b) =>
        a.inventory.id.localeCompare(b.inventory.id),
      );

      for (const item of sortedItems) {
        const orderItem = await tx.orderItem.create({
          data: {
            orderId: created.id,
            productId: item.product.id,
            variantId: item.variant?.id,
            productName: item.product.name,
            variantName: item.variantName,
            sku: item.variant?.sku ?? item.product.sku,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            discountTotal: 0,
            lineTotal: item.lineTotal,
          },
        });
        const quantityBefore = item.inventory.quantity;
        const quantityAfter = quantityBefore - item.quantity;

        await tx.inventory.update({
          where: { id: item.inventory.id },
          data: {
            quantity: quantityAfter,
            soldOut: quantityAfter <= 0,
          },
        });
        await tx.inventoryLog.create({
          data: {
            inventoryId: item.inventory.id,
            productId: item.product.id,
            variantId: item.variant?.id,
            orderId: created.id,
            orderItemId: orderItem.id,
            actorId,
            changeType: InventoryChangeType.ORDER_DECREASE,
            quantityBefore,
            quantityChange: -item.quantity,
            quantityAfter,
            note: `Manual order ${created.code}`,
          },
        });
      }

      await tx.customer.update({
        where: { id: customer.id },
        data: { lastOrderAt: new Date() },
      });

      return tx.order.findUniqueOrThrow({
        where: { id: created.id },
        include: this.orderInclude(),
      });
    });

    return this.toAdminOrder(order);
  }

  async updateStatus(
    id: string,
    updateDto: UpdateOrderStatusDto,
    actorId: string,
  ) {
    const order = await this.findOrderById(id);

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status === updateDto.status) {
      return this.toAdminOrder(order);
    }

    this.assertStatusTransition(order.status, updateDto.status);

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id },
        data: {
          status: updateDto.status,
          shippingStatus: this.resolveShippingStatus(
            order.shippingStatus,
            updateDto.status,
          ),
          confirmedAt:
            updateDto.status === OrderStatus.CONFIRMED
              ? new Date()
              : order.confirmedAt,
          completedAt:
            updateDto.status === OrderStatus.COMPLETED
              ? new Date()
              : order.completedAt,
          returnedAt:
            updateDto.status === OrderStatus.RETURNED
              ? new Date()
              : order.returnedAt,
        },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          fromStatus: order.status,
          toStatus: updateDto.status,
          actorId,
          note: this.nullableTrim(updateDto.note),
        },
      });
    });

    return this.getById(id);
  }

  async cancel(id: string, note: string | undefined, actorId: string) {
    const order = await this.findOrderById(id);

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status === OrderStatus.CANCELLED) {
      return order;
    }

    if (
      order.status === OrderStatus.COMPLETED ||
      order.status === OrderStatus.REFUNDED
    ) {
      throw new BadRequestException('Completed or refunded order cannot cancel');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id },
        data: {
          status: OrderStatus.CANCELLED,
          shippingStatus: ShippingStatus.FAILED,
          cancelledAt: new Date(),
          internalNote: this.nullableTrim(note) ?? order.internalNote,
        },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          fromStatus: order.status,
          toStatus: OrderStatus.CANCELLED,
          actorId,
          note: this.nullableTrim(note),
        },
      });

      for (const item of order.items) {
        const inventory = await this.findInventoryForOrderItem(tx, item);

        if (!inventory) {
          continue;
        }

        const quantityBefore = inventory.quantity;
        const quantityAfter = quantityBefore + item.quantity;

        await tx.inventory.update({
          where: { id: inventory.id },
          data: {
            quantity: quantityAfter,
            soldOut: false,
          },
        });
        await tx.inventoryLog.create({
          data: {
            inventoryId: inventory.id,
            productId: item.productId,
            variantId: item.variantId,
            orderId: id,
            orderItemId: item.id,
            actorId,
            changeType: InventoryChangeType.ORDER_RESTORE,
            quantityBefore,
            quantityChange: item.quantity,
            quantityAfter,
            note: `Cancel order ${order.code}`,
          },
        });
      }
    });

    return this.getById(id);
  }

  async updateNote(id: string, updateDto: UpdateOrderNoteDto) {
    await this.getById(id);

    await this.prisma.order.update({
      where: { id },
      data: {
        internalNote: this.nullableTrim(updateDto.internalNote),
      },
    });

    return this.getById(id);
  }

  async updatePayment(
    id: string,
    updateDto: UpdatePaymentStatusDto,
    actorId: string,
  ) {
    const order = await this.findOrderById(id);

    if (!order) {
      throw new NotFoundException('Order not found');
    }
    const paidAt =
      updateDto.status === PaymentStatus.PAID ? new Date() : undefined;

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id },
        data: {
          paymentStatus: updateDto.status,
        },
      });
      await tx.payment.updateMany({
        where: { orderId: id },
        data: {
          status: updateDto.status,
          transactionCode: this.nullableTrim(updateDto.transactionCode),
          note: this.nullableTrim(updateDto.note),
          confirmedById: actorId,
          paidAt,
        },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          fromStatus: order.status,
          toStatus: order.status,
          actorId,
          note: `Payment status updated to ${updateDto.status}`,
        },
      });
    });

    return this.getById(id);
  }

  private buildAdminWhere(
    query: ListAdminOrdersQueryDto,
  ): Prisma.OrderWhereInput {
    const where: Prisma.OrderWhereInput = {};
    const search = query.search?.trim();

    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } },
        { customerPhone: { contains: search, mode: 'insensitive' } },
        { customerEmail: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.paymentStatus) {
      where.paymentStatus = query.paymentStatus;
    }

    if (query.shippingStatus) {
      where.shippingStatus = query.shippingStatus;
    }

    return where;
  }

  private findOrderById(id: string) {
    return this.prisma.order.findUnique({
      where: { id },
      include: this.orderInclude(),
    });
  }

  private orderInclude() {
    return {
      customer: true,
      items: {
        include: {
          variant: {
            select: {
              id: true,
              name: true,
              sku: true,
              sizeLabel: true,
              colorName: true,
              colorHex: true,
            },
          },
        },
      },
      payments: true,
      shippingAddress: true,
      shipments: true,
      statusHistories: {
        orderBy: { createdAt: 'asc' as const },
      },
    };
  }

  private orderListInclude() {
    return {
      items: {
        include: {
          variant: {
            select: {
              id: true,
              name: true,
              sku: true,
              sizeLabel: true,
              colorName: true,
              colorHex: true,
            },
          },
        },
      },
      payments: {
        select: {
          method: true,
        },
      },
    };
  }

  private assertStatusTransition(from: OrderStatus, to: OrderStatus) {
    if (from === OrderStatus.CANCELLED || from === OrderStatus.REFUNDED) {
      throw new BadRequestException(`Cannot update ${from} order`);
    }

    if (from === OrderStatus.RETURNED && to !== OrderStatus.REFUNDED) {
      throw new BadRequestException('Returned order can only be refunded');
    }

    if (to === OrderStatus.RETURNED && from !== OrderStatus.COMPLETED) {
      throw new BadRequestException('Only completed orders can be marked as returned');
    }

    if (
      from === OrderStatus.COMPLETED &&
      to !== OrderStatus.RETURNED &&
      to !== OrderStatus.REFUNDED
    ) {
      throw new BadRequestException('Completed order can only be returned or refunded');
    }
  }

  private resolveShippingStatus(
    current: ShippingStatus,
    orderStatus: OrderStatus,
  ) {
    if (orderStatus === OrderStatus.SHIPPING) {
      return ShippingStatus.SHIPPING;
    }

    if (orderStatus === OrderStatus.COMPLETED) {
      return ShippingStatus.DELIVERED;
    }

    if (orderStatus === OrderStatus.RETURNED) {
      return ShippingStatus.RETURNED;
    }

    if (orderStatus === OrderStatus.CANCELLED) {
      return ShippingStatus.FAILED;
    }

    return current;
  }

  private async findInventoryForOrderItem(
    tx: Prisma.TransactionClient,
    item: { productId: string | null; variantId: string | null },
  ) {
    if (item.variantId) {
      return tx.inventory.findUnique({ where: { variantId: item.variantId } });
    }

    if (item.productId) {
      return tx.inventory.findUnique({ where: { productId: item.productId } });
    }

    return null;
  }

  private async findOrCreateCustomer(
    tx: Prisma.TransactionClient,
    createDto: CreateAdminOrderDto,
  ) {
    const phone = createDto.customerPhone.trim();
    const email = this.nullableTrim(createDto.customerEmail);
    const existing = await tx.customer.findFirst({
      where: {
        OR: [{ phone }, ...(email ? [{ email }] : [])],
      },
    });

    if (existing) {
      return tx.customer.update({
        where: { id: existing.id },
        data: {
          fullName: createDto.customerName.trim(),
          phone,
          email,
        },
      });
    }

    return tx.customer.create({
      data: {
        fullName: createDto.customerName.trim(),
        phone,
        email,
      },
    });
  }

  private async createOrderCode(tx: Prisma.TransactionClient) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const now = new Date();
      const datePart = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
      ].join('');
      const randomPart = Math.floor(1000 + Math.random() * 9000);
      const code = `DK${datePart}${randomPart}`;
      const existing = await tx.order.findUnique({
        where: { code },
        select: { id: true },
      });

      if (!existing) {
        return code;
      }
    }

    throw new BadRequestException('Could not generate order code');
  }

  private toAdminOrder(order: any) {
    const payment = order.payments?.[0];
    const shippingAddress = order.shippingAddress;

    return {
      id: order.id,
      code: order.code,
      customerId: order.customerId,
      customerName: order.customerName,
      customerEmail: order.customerEmail ?? '',
      customerPhone: order.customerPhone,
      addressLine: shippingAddress?.addressLine ?? '',
      ward: shippingAddress?.ward ?? '',
      district: shippingAddress?.district ?? '',
      province: shippingAddress?.province ?? '',
      country: shippingAddress?.country ?? 'VN',
      status: order.status,
      paymentStatus: order.paymentStatus,
      paymentMethod: payment?.method ?? PaymentMethod.COD,
      shippingStatus: order.shippingStatus,
      subTotal: order.subtotal,
      shippingFee: order.shippingFee,
      discountAmount: order.discountTotal,
      totalAmount: order.grandTotal,
      customerNote: order.customerNote,
      shippingNote: shippingAddress?.note ?? null,
      internalNote: order.internalNote,
      source: order.source,
      items: (order.items ?? []).map((item: any) => ({
        id: item.id,
        productId: item.productId ?? '',
        productName: item.productName,
        variantId: item.variantId,
        variantName: item.variantName,
        variant: item.variant
          ? {
              id: item.variant.id,
              name: item.variant.name,
              sku: item.variant.sku,
              sizeLabel: item.variant.sizeLabel,
              colorName: item.variant.colorName,
              colorHex: item.variant.colorHex,
            }
          : null,
        sku: item.sku ?? '',
        quantity: item.quantity,
        price: item.unitPrice,
      })),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      confirmedAt: order.confirmedAt,
      completedAt: order.completedAt,
      returnedAt: order.returnedAt,
      cancelledAt: order.cancelledAt,
    };
  }

  private nullableTrim(value?: string | null) {
    return value?.trim() || null;
  }
}
