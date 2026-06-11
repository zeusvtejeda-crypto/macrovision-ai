import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import helmet from 'helmet';
import * as compression from 'compression';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const configService = app.get(ConfigService);
  const logger = app.get(WINSTON_MODULE_NEST_PROVIDER);
  app.useLogger(logger);

  const port = configService.get<number>('app.port', 3000);
  const nodeEnv = configService.get<string>('app.nodeEnv', 'development');
  const corsOrigins = configService.get<string[]>('cors.origins', []);

  // Seguridad
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));

  // Compresión GZIP
  app.use(compression());

  // CORS — en desarrollo acepta cualquier origen para que el iPhone pueda conectar
  const corsOrigin = nodeEnv !== 'production'
    ? true                    // acepta cualquier origen en dev
    : corsOrigins;            // lista explícita en producción
  app.enableCors({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
  });

  // Prefijo global de API y versionado
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // Pipes globales — validación y transformación de DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,           // Elimina propiedades no declaradas en DTOs
      forbidNonWhitelisted: true, // Error si llegan propiedades extra
      transform: true,           // Transforma tipos automáticamente
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Filtros e interceptores globales
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformInterceptor(),
  );

  // Swagger — solo en no-producción
  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('MacroVision AI API')
      .setDescription(
        'API completa para la aplicación de conteo de calorías con IA',
      )
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'JWT-auth',
      )
      .addTag('auth', 'Autenticación y autorización')
      .addTag('users', 'Gestión de usuarios y perfiles')
      .addTag('analysis', 'Análisis de alimentos con IA')
      .addTag('diary', 'Diario alimenticio')
      .addTag('nutrition', 'Base de datos nutricional')
      .addTag('subscriptions', 'Suscripciones y pagos')
      .addTag('admin', 'Panel administrativo')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });

    logger.log(
      `📚 Swagger disponible en: http://localhost:${port}/api/docs`,
      'Bootstrap',
    );
  }

  await app.listen(port);

  logger.log(
    `🚀 MacroVision AI Backend corriendo en: http://localhost:${port}/api/v1`,
    'Bootstrap',
  );
  logger.log(`📦 Entorno: ${nodeEnv}`, 'Bootstrap');
}

bootstrap().catch((err) => {
  console.error('Error fatal al iniciar la aplicación:', err);
  process.exit(1);
});
