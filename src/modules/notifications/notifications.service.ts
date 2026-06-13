import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
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
        grandTotal: true,
      },
    });

    if (!order) {
      return [];
    }

    const queued: Array<{ notificationLogId: string; jobId: string }> = [];

    if (order.customerEmail) {
      queued.push(
        await this.enqueueTemplateEmail({
          templateKey: 'order.confirmation',
          recipient: order.customerEmail,
          variables: {
            customerName: order.customerName,
            orderCode: order.code,
            grandTotal: order.grandTotal,
          },
          entityType: 'order',
          entityId: order.id,
        }),
      );
    }

    const adminEmail = await this.getAdminNotificationEmail();

    if (adminEmail) {
      queued.push(
        await this.enqueueRawEmail({
          recipient: adminEmail,
          subject: `Duky Store có đơn hàng mới ${order.code}`,
          body: `Đơn hàng ${order.code} vừa được tạo. Tổng tiền: ${order.grandTotal} VND.`,
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

  private renderTemplate(template: string, variables: Record<string, unknown>) {
    return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
      const value = variables[key];

      return value === undefined || value === null ? '' : String(value);
    });
  }
}
