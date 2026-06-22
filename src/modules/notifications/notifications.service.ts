import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import {
  JobStatus,
  NotificationChannel,
  NotificationStatus,
  Prisma,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { MAIL_QUEUE } from './constants';
import { ListNotificationLogsQueryDto } from './dto/list-notification-logs-query.dto';

type EmailPayload = {
  recipient: string;
  subject: string;
  body: string;
  entityType?: string;
  entityId?: string;
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @InjectQueue(MAIL_QUEUE) private readonly mailQueue: Queue,
  ) {}

  async enqueueOrderCreated(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        code: true,
        customerName: true,
        customerEmail: true,
        customerPhone: true,
        grandTotal: true,
        subtotal: true,
        discountTotal: true,
        shippingFee: true,
        customerNote: true,
        createdAt: true,
        items: {
          select: {
            productName: true,
            variantName: true,
            quantity: true,
            unitPrice: true,
            lineTotal: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        shippingAddress: {
          select: {
            fullName: true,
            phone: true,
            addressLine: true,
            ward: true,
            district: true,
            province: true,
          },
        },
        payments: {
          select: { method: true },
          take: 1,
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!order) {
      return [];
    }

    const orderVariables = this.buildOrderEmailVariables(order);
    const queued: Array<{ notificationLogId: string; jobId: string }> = [];

    if (order.customerEmail) {
      queued.push(
        await this.enqueueTemplateEmail({
          templateKey: 'order.confirmation',
          recipient: order.customerEmail,
          variables: orderVariables,
          entityType: 'order',
          entityId: order.id,
        }),
      );
    }

    const adminEmail = await this.getAdminNotificationEmail();

    if (adminEmail) {
      queued.push(
        await this.enqueueTemplateEmail({
          templateKey: 'order.admin_notification',
          recipient: adminEmail,
          variables: orderVariables,
          entityType: 'order',
          entityId: order.id,
        }),
      );
    }

    const shopEmails: string[] = [];
    for (let i = 0; i < 20; i++) {
      const email = this.configService.get<string>(`MAIL_SHOP_${i}`);
      if (email && email.trim()) {
        shopEmails.push(email.trim());
      }
    }

    for (const shopEmail of shopEmails) {
      queued.push(
        await this.enqueueTemplateEmail({
          templateKey: 'order.admin_notification',
          recipient: shopEmail,
          variables: orderVariables,
          entityType: 'order',
          entityId: order.id,
        }),
      );
    }

    return queued;
  }

  async enqueueTemplateEmail(input: {
    templateKey: string;
    recipient: string;
    variables: Record<string, unknown>;
    entityType?: string;
    entityId?: string;
  }) {
    const template = await this.prisma.notificationTemplate.findFirst({
      where: {
        key: input.templateKey,
        channel: NotificationChannel.EMAIL,
        isActive: true,
      },
    });

    if (!template) {
      return this.enqueueRawEmail({
        recipient: input.recipient,
        subject: input.templateKey,
        body: JSON.stringify(input.variables),
        entityType: input.entityType,
        entityId: input.entityId,
      });
    }

    return this.enqueueEmail({
      templateId: template.id,
      recipient: input.recipient,
      subject: this.renderTemplate(template.subject ?? '', input.variables),
      body: this.renderTemplate(template.body, input.variables),
      entityType: input.entityType,
      entityId: input.entityId,
    });
  }

  enqueueRawEmail(input: EmailPayload) {
    return this.enqueueEmail({
      recipient: input.recipient,
      subject: input.subject,
      body: input.body,
      entityType: input.entityType,
      entityId: input.entityId,
    });
  }

  async listLogs(query: ListNotificationLogsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildLogWhere(query);

    const [total, logs] = await this.prisma.$transaction([
      this.prisma.notificationLog.count({ where }),
      this.prisma.notificationLog.findMany({
        where,
        include: {
          template: {
            select: {
              id: true,
              key: true,
              subject: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private async enqueueEmail(input: EmailPayload & { templateId?: string }) {
    const notificationLog = await this.prisma.notificationLog.create({
      data: {
        templateId: input.templateId,
        channel: NotificationChannel.EMAIL,
        status: NotificationStatus.PENDING,
        recipient: input.recipient.trim(),
        subject: input.subject,
        body: input.body,
        entityType: input.entityType,
        entityId: input.entityId,
      },
    });

    const job = await this.mailQueue.add('send-email', {
      notificationLogId: notificationLog.id,
    });

    await this.prisma.backgroundJob.create({
      data: {
        queueName: MAIL_QUEUE,
        jobId: String(job.id),
        name: 'send-email',
        status: JobStatus.WAITING,
        payload: { notificationLogId: notificationLog.id },
        runAt: new Date(),
      },
    });

    return {
      notificationLogId: notificationLog.id,
      jobId: String(job.id),
    };
  }

  private buildLogWhere(
    query: ListNotificationLogsQueryDto,
  ): Prisma.NotificationLogWhereInput {
    return {
      ...(query.status ? { status: query.status } : {}),
      ...(query.channel ? { channel: query.channel } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
    };
  }

  private async getAdminNotificationEmail() {
    const setting = await this.prisma.setting.findUnique({
      where: { key: 'contact.email' },
      select: { value: true },
    });
    const value = setting?.value;

    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  // ─── Order email variable builder ────────────────────────────────────────────

  private buildOrderEmailVariables(order: {
    code: string;
    customerName: string;
    customerPhone: string;
    customerEmail?: string | null;
    grandTotal: number;
    subtotal: number;
    discountTotal: number;
    shippingFee: number;
    customerNote?: string | null;
    createdAt: Date;
    items: Array<{
      productName: string;
      variantName?: string | null;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
    }>;
    shippingAddress?: {
      fullName: string;
      phone: string;
      addressLine: string;
      ward?: string | null;
      district?: string | null;
      province?: string | null;
    } | null;
    payments: Array<{ method: string }>;
  }): Record<string, string> {
    // --- Items HTML rows ---
    const itemsHtml = order.items
      .map(
        (item, idx) =>
          `<tr style="background:${idx % 2 === 0 ? '#ffffff' : '#faf8f5'};">` +
          `<td style="padding:14px 16px;font-size:14px;color:#1a1a2e;border-bottom:1px solid #ede8e3;">` +
          `${this.escapeHtml(item.productName)}` +
          (item.variantName
            ? `<br><span style="color:#888;font-size:12px;">${this.escapeHtml(item.variantName)}</span>`
            : '') +
          `</td>` +
          `<td style="padding:14px 8px;font-size:14px;color:#555;text-align:center;border-bottom:1px solid #ede8e3;">${item.quantity}</td>` +
          `<td style="padding:14px 16px;font-size:14px;color:#1a1a2e;font-weight:600;text-align:right;border-bottom:1px solid #ede8e3;">${this.formatCurrency(item.lineTotal)}&nbsp;₫</td>` +
          `</tr>`,
      )
      .join('');

    // --- Shipping address ---
    const addr = order.shippingAddress;
    const shippingAddress = addr
      ? [addr.fullName, addr.phone, addr.addressLine, addr.ward, addr.district, addr.province]
          .filter(Boolean)
          .join(', ')
      : 'Chưa cập nhật';

    // --- Payment method ---
    const paymentMethod = this.getPaymentMethodLabel(order.payments[0]?.method ?? '');

    // --- Order date ---
    const orderDate = order.createdAt.toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    // --- Shipping fee display ---
    const shippingFee =
      order.shippingFee === 0
        ? 'Khách hàng tự thanh toán'
        : `${this.formatCurrency(order.shippingFee)}&nbsp;₫`;

    // --- Customer note block (pre-rendered HTML) ---
    const customerNoteHtml = order.customerNote
      ? `<tr><td style="padding:0 48px 28px;">` +
        `<div style="background:#fffbf0;border-left:4px solid #c9a96e;border-radius:4px;padding:16px 20px;">` +
        `<p style="color:#888;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px;font-weight:600;">Ghi chú của khách</p>` +
        `<p style="color:#444;font-size:14px;line-height:1.6;margin:0;">${this.escapeHtml(order.customerNote)}</p>` +
        `</div></td></tr>`
      : '';

    return {
      customerName: this.escapeHtml(order.customerName),
      orderCode: this.escapeHtml(order.code),
      orderDate,
      customerPhone: this.escapeHtml(order.customerPhone),
      customerEmail: this.escapeHtml(order.customerEmail ?? ''),
      itemsHtml,
      subtotal: this.formatCurrency(order.subtotal),
      shippingFee,
      discountTotal: this.formatCurrency(order.discountTotal),
      grandTotal: this.formatCurrency(order.grandTotal),
      shippingAddress: this.escapeHtml(shippingAddress),
      paymentMethod: this.escapeHtml(paymentMethod),
      customerNoteHtml,
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('vi-VN').format(amount);
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private getPaymentMethodLabel(method: string): string {
    const labels: Record<string, string> = {
      COD: 'Thanh toán khi nhận hàng (COD)',
      BANK_TRANSFER: 'Chuyển khoản ngân hàng',
      MOMO: 'Ví MoMo',
      VNPAY: 'VNPay',
      ZALOPAY: 'ZaloPay',
      CREDIT_CARD: 'Thẻ tín dụng / Ghi nợ',
    };
    return labels[method] ?? (method || 'Chưa xác định');
  }

  private renderTemplate(template: string, variables: Record<string, unknown>) {
    return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
      const value = variables[key];
      return value === undefined || value === null ? '' : String(value);
    });
  }
}
