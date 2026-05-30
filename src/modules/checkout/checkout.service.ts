import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CartStatus,
  InventoryChangeType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  ProductStatus,
  ShippingStatus,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CheckoutDto } from './dto/checkout.dto';

@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async checkout(checkoutDto: CheckoutDto) {
    const sessionId = checkoutDto.sessionId.trim();

    const order = await this.prisma.$transaction(async (tx) => {
      const cart = await tx.cart.findFirst({
        where: {
          sessionId,
          status: CartStatus.ACTIVE,
        },
        include: {
          items: {
            include: {
              product: {
                include: {
                  inventory: true,
                },
              },
              variant: {
                include: {
                  inventory: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!cart) {
        throw new NotFoundException('Active cart not found');
      }

      if (!cart.items.length) {
        throw new BadRequestException('Cart is empty');
      }

      const normalizedItems = cart.items.map((item) => {
        if (
          !item.product ||
          item.product.deletedAt ||
          item.product.status !== ProductStatus.PUBLISHED
        ) {
          throw new BadRequestException(
            `Product ${item.productName} is not available`,
          );
        }

        if (item.variantId && (!item.variant || !item.variant.isActive)) {
          throw new BadRequestException(
            `Variant ${item.variantName ?? item.sku ?? item.id} is not available`,
          );
        }

        const inventory = item.variant?.inventory ?? item.product.inventory;

        if (!inventory || inventory.soldOut) {
          throw new BadRequestException(
            `Product ${item.productName} is out of stock`,
          );
        }

        const unitPrice =
          item.variant?.salePrice ??
          item.variant?.price ??
          item.product.salePrice ??
          item.product.originalPrice;
        const lineTotal = unitPrice * item.quantity;

        if (item.quantity > inventory.quantity - inventory.reservedQuantity) {
          throw new BadRequestException(
            `Requested quantity exceeds stock for ${item.productName}`,
          );
        }

        return {
          cartItem: item,
          inventory,
          unitPrice,
          lineTotal,
        };
      });

      const subtotal = normalizedItems.reduce(
        (sum, item) => sum + item.lineTotal,
        0,
      );
      const discountTotal = 0;
      const shippingFee = await this.resolveShippingFee(tx, subtotal);
      const grandTotal = subtotal - discountTotal + shippingFee;
      const customer = await this.findOrCreateCustomer(tx, checkoutDto);
      const order = await tx.order.create({
        data: {
          code: await this.createOrderCode(tx),
          customerId: customer.id,
          cartId: cart.id,
          status: OrderStatus.PENDING,
          paymentStatus: PaymentStatus.UNPAID,
          shippingStatus: ShippingStatus.NOT_SHIPPED,
          customerName: checkoutDto.customerName.trim(),
          customerPhone: checkoutDto.customerPhone.trim(),
          customerEmail: this.nullableTrim(checkoutDto.customerEmail),
          subtotal,
          discountTotal,
          shippingFee,
          grandTotal,
          customerNote: this.nullableTrim(checkoutDto.customerNote),
          source: 'web',
        },
      });

      await tx.shippingAddress.create({
        data: {
          orderId: order.id,
          fullName: checkoutDto.customerName.trim(),
          phone: checkoutDto.customerPhone.trim(),
          addressLine: checkoutDto.addressLine.trim(),
          ward: this.nullableTrim(checkoutDto.ward),
          district: this.nullableTrim(checkoutDto.district),
          province: this.nullableTrim(checkoutDto.province),
          country: checkoutDto.country?.trim() || 'VN',
          note: this.nullableTrim(checkoutDto.shippingNote),
        },
      });

      await tx.payment.create({
        data: {
          orderId: order.id,
          method: checkoutDto.paymentMethod,
          status: PaymentStatus.UNPAID,
          amount: grandTotal,
        },
      });

      await tx.shipment.create({
        data: {
          orderId: order.id,
          status: ShippingStatus.NOT_SHIPPED,
          shippingFee,
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          toStatus: OrderStatus.PENDING,
          note: 'Order created from checkout',
        },
      });

      for (const item of normalizedItems) {
        const orderItem = await tx.orderItem.create({
          data: {
            orderId: order.id,
            productId: item.cartItem.productId,
            variantId: item.cartItem.variantId,
            productName: item.cartItem.productName,
            variantName: item.cartItem.variantName,
            sku: item.cartItem.sku,
            unitPrice: item.unitPrice,
            quantity: item.cartItem.quantity,
            discountTotal: 0,
            lineTotal: item.lineTotal,
          },
        });
        const quantityBefore = item.inventory.quantity;
        const quantityAfter = quantityBefore - item.cartItem.quantity;

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
            productId: item.cartItem.productId,
            variantId: item.cartItem.variantId,
            orderId: order.id,
            orderItemId: orderItem.id,
            changeType: InventoryChangeType.ORDER_DECREASE,
            quantityBefore,
            quantityChange: -item.cartItem.quantity,
            quantityAfter,
            note: `Order ${order.code}`,
          },
        });
      }

      await tx.cart.update({
        where: { id: cart.id },
        data: {
          status: CartStatus.CHECKED_OUT,
          subtotal,
          discountTotal,
          shippingFee,
          total: grandTotal,
        },
      });
      await tx.customer.update({
        where: { id: customer.id },
        data: { lastOrderAt: new Date() },
      });

      return this.getOrderPayload(tx, order.id);
    });

    this.notificationsService.enqueueOrderCreated(order.id).catch((error) => {
      console.warn('Failed to queue order notifications', error);
    });

    return order;
  }

  async getPublicOrder(code: string, phone: string) {
    const order = await this.prisma.order.findFirst({
      where: {
        code: code.trim(),
        customerPhone: phone.trim(),
      },
      include: this.orderInclude(),
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return this.toOrder(order);
  }

  private async findOrCreateCustomer(
    tx: Prisma.TransactionClient,
    checkoutDto: CheckoutDto,
  ) {
    const phone = checkoutDto.customerPhone.trim();
    const email = this.nullableTrim(checkoutDto.customerEmail);

    if (checkoutDto.customerId) {
      const existing = await tx.customer.findUnique({
        where: { id: checkoutDto.customerId },
      });
      if (existing) {
        return tx.customer.update({
          where: { id: existing.id },
          data: {
            fullName: checkoutDto.customerName.trim(),
            phone,
            email: email || existing.email,
          },
        });
      }
    }

    const existing = await tx.customer.findFirst({
      where: {
        OR: [{ phone }, ...(email ? [{ email }] : [])],
      },
    });

    if (existing) {
      return tx.customer.update({
        where: { id: existing.id },
        data: {
          fullName: checkoutDto.customerName.trim(),
          phone,
          email,
        },
      });
    }

    return tx.customer.create({
      data: {
        fullName: checkoutDto.customerName.trim(),
        phone,
        email,
      },
    });
  }

  private async resolveShippingFee(tx: Prisma.TransactionClient, subtotal: number) {
    const defaultRate = await tx.shippingRate.findFirst({
      where: {
        isActive: true,
        OR: [{ isDefault: true }, { zoneId: null }],
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    if (!defaultRate) {
      return 0;
    }

    if (
      defaultRate.freeShippingThreshold !== null &&
      subtotal >= defaultRate.freeShippingThreshold
    ) {
      return 0;
    }

    if (
      defaultRate.minOrderTotal !== null &&
      subtotal < defaultRate.minOrderTotal
    ) {
      return 0;
    }

    return defaultRate.fee;
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

  private getOrderPayload(tx: Prisma.TransactionClient, id: string) {
    return tx.order.findUniqueOrThrow({
      where: { id },
      include: this.orderInclude(),
    });
  }

  private orderInclude(): Prisma.OrderInclude {
    return {
      items: true,
      payments: true,
      shippingAddress: true,
      shipments: true,
      statusHistories: {
        orderBy: { createdAt: 'asc' },
      },
    };
  }

  private nullableTrim(value?: string | null) {
    return value?.trim() || null;
  }

  private toOrder(order: Prisma.OrderGetPayload<{ include: ReturnType<CheckoutService['orderInclude']> }>) {
    return order;
  }
}
