import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { RedisOptions } from 'ioredis';
import { MAIL_QUEUE } from './constants';
import { AdminNotificationsController } from './notifications-admin.controller';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsService } from './notifications.service';

function getRedisConnection(configService: ConfigService): RedisOptions {
  const redisUrl = configService.get<string>('REDIS_URL');

  if (redisUrl) {
    const parsedUrl = new URL(redisUrl);
    const db =
      parsedUrl.pathname.length > 1
        ? Number(parsedUrl.pathname.replace('/', ''))
        : undefined;

    return {
      host: parsedUrl.hostname,
      port: Number(parsedUrl.port || 6379),
      username: parsedUrl.username
        ? decodeURIComponent(parsedUrl.username)
        : undefined,
      password: parsedUrl.password
        ? decodeURIComponent(parsedUrl.password)
        : undefined,
      db: Number.isNaN(db) ? undefined : db,
      tls: parsedUrl.protocol === 'rediss:' ? {} : undefined,
    };
  }

  return {
    host: configService.get<string>('REDIS_HOST') ?? 'localhost',
    port: Number(configService.get<string>('REDIS_PORT') ?? 6379),
    password: configService.get<string>('REDIS_PASSWORD') || undefined,
  };
}

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: getRedisConnection(configService),
      }),
    }),
    BullModule.registerQueue({
      name: MAIL_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    }),
  ],
  controllers: [AdminNotificationsController],
  providers: [NotificationsService, NotificationsProcessor],
  exports: [NotificationsService],
})
export class NotificationsModule {}
