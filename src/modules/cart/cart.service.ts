import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CartStatus,
  Prisma,
  ProductStatus,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

type CartWithItems = {
  id: string;
  sessionId: string | null;
  status: CartStatus;
  currency: string;
  subtotal: number;
  discountTotal: number;
  shippingFee: number;
  total: number;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    id: string;
    productId: string;
    variantId: string | null;
    productName: string;
    variantName: string | null;
    sku: string | null;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
    product: unknown;
    variant: unknown;
  }>;
};

type InventoryForCart = {
  quantity: number;
  reservedQuantity: number;
  soldOut: boolean;
};

type ProductForCart = {
  id: string;
  name: string;
  sku: string | null;
  status: ProductStatus;
  originalPrice: number;
  salePrice: number | null;
  contactForPrice: boolean;
  inventory: InventoryForCart | null;
  variants: Array<{
    id: string;
    name: string | null;
    sku: string;
    sizeLabel: string | null;
    sizeGender: string | null;
    colorName: string | null;
    colorHex: string | null;
    price: number | null;
    salePrice: number | null;
    isActive: boolean;
    deletedAt: Date | null;
    inventory: InventoryForCart | null;
  }>;
};

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateCart(sessionId: string) {
    const cart = await this.findOrCreateActiveCart(sessionId);

    return this.toCart(cart as unknown as CartWithItems);
  }

  async addItem(addDto: AddCartItemDto) {
    const cart = await this.findOrCreateActiveCart(addDto.sessionId);
    const product = await this.getProductForCart(addDto.productId);
    const variant = this.resolveVariant(product, addDto.variantId);
    const existingItem = cart.items.find(
      (item) =>
        item.productId === addDto.productId &&
        (item.variantId ?? null) === (addDto.variantId ?? null),
    );
    const nextQuantity = (existingItem?.quantity ?? 0) + addDto.quantity;
    const purchasable = this.resolvePurchasable(product, variant);

    this.assertStockAvailable(purchasable, nextQuantity);

    const updatedCart = await this.prisma.$transaction(async (tx) => {
      if (existingItem) {
        await tx.cartItem.update({
          where: { id: existingItem.id },
          data: {
            quantity: nextQuantity,
            unitPrice: purchasable.unitPrice,
            lineTotal: purchasable.unitPrice * nextQuantity,
          },
        });
      } else {
        await tx.cartItem.create({
          data: {
            cartId: cart.id,
            productId: product.id,
            variantId: variant?.id ?? null,
            productName: product.name,
            variantName: this.getVariantName(variant),
            sku: variant?.sku ?? product.sku,
            unitPrice: purchasable.unitPrice,
            quantity: addDto.quantity,
            lineTotal: purchasable.unitPrice * addDto.quantity,
          },
        });
      }

      return this.recalculateCart(tx, cart.id);
    });

    return this.toCart(updatedCart as unknown as CartWithItems);
  }

  async updateItem(id: string, updateDto: UpdateCartItemDto) {
    const item = await this.getOwnedItemOrThrow(id, updateDto.sessionId);
    const product = await this.getProductForCart(item.productId);
    const variant = this.resolveVariant(product, item.variantId ?? undefined);
    const purchasable = this.resolvePurchasable(product, variant);

    this.assertStockAvailable(purchasable, updateDto.quantity);

    const updatedCart = await this.prisma.$transaction(async (tx) => {
      await tx.cartItem.update({
        where: { id },
        data: {
          quantity: updateDto.quantity,
          unitPrice: purchasable.unitPrice,
          lineTotal: purchasable.unitPrice * updateDto.quantity,
          productName: product.name,
          variantName: this.getVariantName(variant),
          sku: variant?.sku ?? product.sku,
        },
      });

      return this.recalculateCart(tx, item.cartId);
    });

    return this.toCart(updatedCart as unknown as CartWithItems);
  }

  async removeItem(id: string, sessionId: string) {
    const item = await this.getOwnedItemOrThrow(id, sessionId);

    const updatedCart = await this.prisma.$transaction(async (tx) => {
      await tx.cartItem.delete({ where: { id } });

      return this.recalculateCart(tx, item.cartId);
    });

    return this.toCart(updatedCart as unknown as CartWithItems);
  }

  async clearCart(sessionId: string) {
    const cart = await this.findOrCreateActiveCart(sessionId);

    const updatedCart = await this.prisma.$transaction(async (tx) => {
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

      return this.recalculateCart(tx, cart.id);
    });

    return this.toCart(updatedCart as unknown as CartWithItems);
  }

  private async findOrCreateActiveCart(sessionId: string) {
    const normalizedSessionId = sessionId.trim();

    if (!normalizedSessionId) {
      throw new BadRequestException('Session ID is required');
    }

    const existingCart = await this.prisma.cart.findFirst({
      where: {
        sessionId: normalizedSessionId,
        status: CartStatus.ACTIVE,
      },
      include: this.cartInclude(),
      orderBy: { createdAt: 'desc' },
    });

    if (existingCart) {
      return existingCart;
    }

    return this.prisma.cart.create({
      data: {
        sessionId: normalizedSessionId,
        status: CartStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      include: this.cartInclude(),
    });
  }

  private async getOwnedItemOrThrow(id: string, sessionId: string) {
    const item = await this.prisma.cartItem.findFirst({
      where: {
        id,
        cart: {
          sessionId: sessionId.trim(),
          status: CartStatus.ACTIVE,
        },
      },
      include: {
        cart: true,
      },
    });

    if (!item) {
      throw new NotFoundException('Cart item not found');
    }

    return item;
  }

  private async getProductForCart(productId: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        id: productId,
        deletedAt: null,
        status: ProductStatus.PUBLISHED,
      },
      include: this.productInclude(),
    });

    if (!product) {
      throw new NotFoundException('Product not found or not published');
    }

    if (product.contactForPrice) {
      throw new BadRequestException('Product cannot be added to cart');
    }

    return product as unknown as ProductForCart;
  }

  private resolveVariant(product: ProductForCart, variantId?: string) {
    if (!variantId) {
      return undefined;
    }

    const variant = product.variants.find(
      (item) => item.id === variantId && item.deletedAt === null,
    );

    if (!variant) {
      throw new NotFoundException('Product variant not found');
    }

    if (!variant.isActive) {
      throw new BadRequestException('Product variant is not active');
    }

    return variant;
  }

  private resolvePurchasable(
    product: ProductForCart,
    variant?: ProductForCart['variants'][number],
  ) {
    const inventory = variant?.inventory ?? product.inventory;

    if (!inventory) {
      throw new BadRequestException('Product is out of stock');
    }

    const unitPrice =
      variant?.salePrice ??
      variant?.price ??
      product.salePrice ??
      product.originalPrice;

    return {
      unitPrice,
      availableQuantity: inventory.quantity - inventory.reservedQuantity,
      soldOut: inventory.soldOut,
    };
  }

  private assertStockAvailable(
    purchasable: {
      availableQuantity: number;
      soldOut: boolean;
    },
    requestedQuantity: number,
  ) {
    if (purchasable.soldOut || purchasable.availableQuantity <= 0) {
      throw new BadRequestException('Product is out of stock');
    }

    if (requestedQuantity > purchasable.availableQuantity) {
      throw new BadRequestException('Requested quantity exceeds stock');
    }
  }

  private async recalculateCart(tx: Prisma.TransactionClient, cartId: string) {
    const items = await tx.cartItem.findMany({
      where: { cartId },
      select: { lineTotal: true },
    });
    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);

    return tx.cart.update({
      where: { id: cartId },
      data: {
        subtotal,
        total: subtotal,
        discountTotal: 0,
        shippingFee: 0,
      },
      include: this.cartInclude(),
    });
  }

  private getVariantName(variant?: ProductForCart['variants'][number]) {
    if (!variant) {
      return null;
    }

    return (
      variant.name ||
      [variant.sizeLabel, variant.colorName].filter(Boolean).join(' - ') ||
      null
    );
  }

  private cartInclude(): Prisma.CartInclude {
    return {
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              status: true,
              thumbnailMedia: {
                select: {
                  id: true,
                  url: true,
                  secureUrl: true,
                  altText: true,
                },
              },
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
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    };
  }

  private productInclude(): Prisma.ProductInclude {
    return {
      inventory: true,
      variants: {
        include: {
          inventory: true,
        },
      },
    };
  }

  private toCart(cart: CartWithItems) {
    return {
      id: cart.id,
      sessionId: cart.sessionId,
      status: cart.status,
      currency: cart.currency,
      subtotal: cart.subtotal,
      discountTotal: cart.discountTotal,
      shippingFee: cart.shippingFee,
      total: cart.total,
      expiresAt: cart.expiresAt,
      createdAt: cart.createdAt,
      updatedAt: cart.updatedAt,
      items: cart.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        variantId: item.variantId,
        productName: item.productName,
        variantName: item.variantName,
        sku: item.sku,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        lineTotal: item.lineTotal,
        product: item.product,
        variant: item.variant,
      })),
    };
  }
}
