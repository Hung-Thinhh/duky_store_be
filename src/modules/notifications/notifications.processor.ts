import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { createTransport, Transporter } from 'nodemailer';
import {
  JobStatus,
  NotificationStatus,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { MAIL_QUEUE } from './constants';

type MailJobData = {
  notificationLogId: string;
};

@Injectable()
@Processor(MAIL_QUEUE)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);
  private transporter?: Transporter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  async process(job: Job<MailJobData>) {
    await this.markJob(job, JobStatus.ACTIVE);

    try {
      const notificationLog = await this.prisma.notificationLog.findUnique({
        where: { id: job.data.notificationLogId },
      });

      if (!notificationLog) {
        throw new Error('Notification log not found');
      }

      if (!this.hasSmtpConfig()) {
        this.logger.warn(
          `SMTP is not configured. Marking email ${notificationLog.id} as sent in local mode.`,
        );
      } else {
        await this.getTransporter().sendMail({
          from: this.configService.get<string>('MAIL_FROM') ?? 'Duky Store <no-reply@dukystore.local>',
          to: notificationLog.recipient,
          subject: notificationLog.subject ?? 'Duky Store notification',
          text: notificationLog.body ?? '',
          html: notificationLog.body ?? '',
        });
      }

      await this.prisma.notificationLog.update({
        where: { id: notificationLog.id },
        data: {
          status: NotificationStatus.SENT,
          sentAt: new Date(),
          errorMessage: null,
        },
      });
      await this.markJob(job, JobStatus.COMPLETED);

      return { notificationLogId: notificationLog.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      await this.prisma.notificationLog.updateMany({
        where: { id: job.data.notificationLogId },
        data: {
          status: NotificationStatus.FAILED,
          errorMessage: message,
        },
      });
      await this.markJob(job, JobStatus.FAILED, message);

      throw error;
    }
  }

  private hasSmtpConfig() {
    return Boolean(this.configService.get<string>('MAIL_HOST'));
  }

  private getTransporter() {
    if (!this.transporter) {
      const user = this.configService.get<string>('MAIL_USER');
      const pass = this.configService.get<string>('MAIL_PASSWORD');

      this.transporter = createTransport({
        host: this.configService.getOrThrow<string>('MAIL_HOST'),
        port: Number(this.configService.get<string>('MAIL_PORT') ?? 587),
        secure: this.configService.get<string>('MAIL_SECURE') === 'true',
        auth: user && pass ? { user, pass } : undefined,
      });
    }

    return this.transporter;
  }

  private async markJob(job: Job<MailJobData>, status: JobStatus, error?: string) {
    await this.prisma.backgroundJob.updateMany({
      where: {
        queueName: MAIL_QUEUE,
        jobId: String(job.id),
      },
      data: {
        status,
        attempts: job.attemptsMade,
        errorMessage: error,
        completedAt: status === JobStatus.COMPLETED ? new Date() : undefined,
      },
    });
  }
}
