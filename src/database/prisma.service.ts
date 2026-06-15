import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private pool: Pool;

  constructor(configService: ConfigService) {
    const connectionString = configService.getOrThrow<string>('DATABASE_URL');
    
    // Khởi tạo pg connection pool tối ưu cho NestJS backend
    const pool = new Pool({
      connectionString,
      max: 20,              // số lượng connection tối đa trong pool
      idleTimeoutMillis: 30000, // đóng connection nhàn rỗi sau 30s
      connectionTimeoutMillis: 2000, // timeout khi kết nối mới
    });

    const adapter = new PrismaPg(pool);

    super({
      adapter,
      log:
        configService.get<string>('NODE_ENV') === 'development'
          ? ['query', 'warn', 'error']
          : ['warn', 'error'],
      transactionOptions: {
        maxWait: 10000,   // thời gian tối đa đợi slot transaction (10s)
        timeout: 30000,   // thời gian tối đa chạy 1 transaction (30s)
      },
    });

    this.pool = pool;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
  }
}
