import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ListCustomerOrdersQueryDto } from './dto/list-customer-orders-query.dto';
import { ListCustomersQueryDto } from './dto/list-customers-query.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async listAdmin(query: ListCustomersQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildCustomerWhere(query);

    const [total, customers] = await this.prisma.$transaction([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        select: {
          id: true,
          fullName: true,
          phone: true,
          email: true,
          status: true,
          type: true,
          note: true,
          lastOrderAt: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              orders: true,
              addresses: true,
            },
          },
        },
        orderBy: [{ lastOrderAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: customers,
      pagination: this.toPagination(page, limit, total),
    };
  }

  async getById(id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
      include: {
        addresses: {
          orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
        },
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            code: true,
            status: true,
            paymentStatus: true,
            shippingStatus: true,
            grandTotal: true,
            createdAt: true,
            completedAt: true,
            cancelledAt: true,
            _count: {
              select: { items: true },
            },
          },
        },
        _count: {
          select: {
            orders: true,
            addresses: true,
            reviews: true,
            couponUsages: true,
          },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return customer;
  }

  async listOrders(id: string, query: ListCustomerOrdersQueryDto) {
    await this.assertCustomerExists(id);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.OrderWhereInput = {
      customerId: id,
      ...(query.status ? { status: query.status } : {}),
    };

    const [total, orders] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: {
          items: {
            select: {
              id: true,
              productId: true,
              variantId: true,
              productName: true,
              variantName: true,
              sku: true,
              unitPrice: true,
              quantity: true,
              lineTotal: true,
            },
          },
          payments: true,
          shippingAddress: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: orders,
      pagination: this.toPagination(page, limit, total),
    };
  }

  async update(id: string, updateDto: UpdateCustomerDto) {
    await this.assertCustomerExists(id);
    const data: Prisma.CustomerUpdateInput = {};

    if (updateDto.fullName !== undefined) {
      data.fullName = updateDto.fullName.trim();
    }

    if (updateDto.phone !== undefined) {
      data.phone = await this.prepareUniquePhone(updateDto.phone, id);
    }

    if (updateDto.email !== undefined) {
      data.email = await this.prepareUniqueEmail(updateDto.email, id);
    }

    if (updateDto.status !== undefined) {
      data.status = updateDto.status;
    }

    if (updateDto.type !== undefined) {
      data.type = updateDto.type;
    }

    if (updateDto.note !== undefined) {
      data.note = this.nullableTrim(updateDto.note);
    }

    if (!Object.keys(data).length) {
      throw new BadRequestException('No update data provided');
    }

    await this.prisma.customer.update({
      where: { id },
      data,
    });

    return this.getById(id);
  }

  private buildCustomerWhere(
    query: ListCustomersQueryDto,
  ): Prisma.CustomerWhereInput {
    const where: Prisma.CustomerWhereInput = {
      deletedAt: null,
    };
    const search = query.search?.trim();

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.type) {
      where.type = query.type;
    }

    return where;
  }

  private async assertCustomerExists(id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
  }

  private async prepareUniquePhone(phone: string, id: string) {
    const normalizedPhone = this.nullableTrim(phone);

    if (!normalizedPhone) {
      return null;
    }

    const existing = await this.prisma.customer.findFirst({
      where: {
        phone: normalizedPhone,
        NOT: { id },
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Customer phone is already used');
    }

    return normalizedPhone;
  }

  private async prepareUniqueEmail(email: string, id: string) {
    const normalizedEmail = this.nullableTrim(email)?.toLowerCase() ?? null;

    if (!normalizedEmail) {
      return null;
    }

    const existing = await this.prisma.customer.findFirst({
      where: {
        email: normalizedEmail,
        NOT: { id },
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Customer email is already used');
    }

    return normalizedEmail;
  }

  private nullableTrim(value?: string | null) {
    return value?.trim() || null;
  }

  private toPagination(page: number, limit: number, total: number) {
    return {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }
}
