import { type INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/errors';
import type { AppConfig } from './config/env';

/**
 * Configuration HTTP commune au serveur réel (main.ts) et aux tests
 * d'intégration : ce qui est testé est ce qui tourne.
 */
export function configureApp(app: INestApplication, config: AppConfig): void {
  const express = app as NestExpressApplication;
  express.disable('x-powered-by');
  if (config.TRUST_PROXY) express.set('trust proxy', 1);

  app.use(helmet());
  app.enableCors({
    origin: config.CORS_ORIGINS.length > 0 ? config.CORS_ORIGINS : false,
    credentials: true,
    allowedHeaders: ['authorization', 'content-type', 'x-request-id', 'idempotency-key'],
    exposedHeaders: ['x-request-id'],
  });

  // Toutes les routes : /api/v1/...
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: false,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
}

export function swaggerEnabled(config: AppConfig): boolean {
  return config.SWAGGER_ENABLED ?? config.NODE_ENV !== 'production';
}

export function setupSwagger(app: INestApplication): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('CRM SaaS — API')
      .setDescription(
        'API REST du CRM. Phase 1 : authentification, organisations, membres, rôles et audit. ' +
          'Erreurs normalisées : { error: { code, message, details?, requestId } }.',
      )
      .setVersion('0.1.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document);
}
