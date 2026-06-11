import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import configuration from './config/configuration';
import { validationSchema } from './config/validation.schema';
import { DatabaseModule } from './database/database.module';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { FoodAnalysisModule } from './modules/food-analysis/food-analysis.module';
import { DiaryModule } from './modules/diary/diary.module';
import { NutritionModule } from './modules/nutrition/nutrition.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    // Configuración global con validación de variables de entorno
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),

    // Logging estructurado con Winston
    WinstonModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        transports: [
          new winston.transports.Console({
            format: winston.format.combine(
              winston.format.timestamp(),
              winston.format.ms(),
              configService.get('app.nodeEnv') === 'production'
                ? winston.format.json()
                : winston.format.combine(
                    winston.format.colorize({ all: true }),
                    winston.format.printf(
                      ({ timestamp, level, message, context, ms }) =>
                        `${timestamp} [${context || 'App'}] ${level}: ${message} ${ms}`,
                    ),
                  ),
            ),
          }),
          // En producción, también escribir a archivo
          ...(configService.get('app.nodeEnv') === 'production'
            ? [
                new winston.transports.File({
                  filename: 'logs/error.log',
                  level: 'error',
                  format: winston.format.json(),
                }),
                new winston.transports.File({
                  filename: 'logs/combined.log',
                  format: winston.format.json(),
                }),
              ]
            : []),
        ],
      }),
    }),

    // Rate limiting global
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => [
        {
          name: 'global',
          ttl: configService.get<number>('throttle.ttl', 60000),
          limit: configService.get<number>('throttle.limit', 60),
        },
      ],
    }),

    // Tareas programadas (racha diaria, reportes semanales, etc.)
    ScheduleModule.forRoot(),

    // Módulo de base de datos (Prisma)
    DatabaseModule,

    // Servicios de IA (global)
    AiModule,

    // Módulos de negocio
    AuthModule,
    UsersModule,
    FoodAnalysisModule,
    DiaryModule,
    NutritionModule,
    SubscriptionsModule,
    AdminModule,
  ],
})
export class AppModule {}
