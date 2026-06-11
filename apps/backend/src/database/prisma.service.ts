import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
      ],
    });

    // Log de queries solo en development
    if (process.env.NODE_ENV === 'development') {
      (this as any).$on('query', (e: any) => {
        if (e.duration > 500) {
          // Alerta de query lenta (>500ms)
          this.logger.warn(
            `Query lenta (${e.duration}ms): ${e.query.substring(0, 100)}...`,
          );
        }
      });
    }

    (this as any).$on('error', (e: any) => {
      this.logger.error(`Prisma error: ${e.message}`);
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Conectado a PostgreSQL via Prisma');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Desconectado de PostgreSQL');
  }

  // Helper para limpiar la BD en tests
  async cleanDatabase() {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('cleanDatabase solo puede usarse en entorno test');
    }

    const tableNames = [
      'ai_feedback',
      'diary_entry_foods',
      'diary_entries',
      'food_analysis_items',
      'food_analyses',
      'weight_logs',
      'payments',
      'subscriptions',
      'refresh_tokens',
      'user_notifications',
      'user_profiles',
      'users',
      'food_items',
      'admin_logs',
    ];

    for (const tableName of tableNames) {
      await this.$executeRawUnsafe(`TRUNCATE TABLE "${tableName}" CASCADE;`);
    }
  }
}
