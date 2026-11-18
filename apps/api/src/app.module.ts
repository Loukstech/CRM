import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { requestContextMiddleware } from './common/request-context';
import { ConfigModule } from './config/config.module';
import { APP_CONFIG, type AppConfig } from './config/env';
import { DatabaseModule } from './database/database.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { CrmModule } from './modules/crm/crm.module';
import { HealthModule } from './modules/health/health.controller';
import { MailModule } from './modules/mail/mail.module';
import { MembershipsModule } from './modules/memberships/memberships.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { RolesModule } from './modules/roles/roles.controller';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    // Compteurs en mémoire : valable pour UNE instance d'API. Un stockage
    // partagé (Redis) est requis avant tout déploiement multi-instance.
    ThrottlerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => [
        { name: 'default', ttl: config.RATE_LIMIT_WINDOW_SECONDS * 1000, limit: config.RATE_LIMIT_MAX },
      ],
    }),
    AuditModule,
    MailModule,
    AuthModule,
    OrganizationsModule,
    MembershipsModule,
    RolesModule,
    CrmModule,
    HealthModule,
  ],
  // Limitation de débit globale ; AccessGuard (authentification + permissions)
  // est enregistré par AuthModule.
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(requestContextMiddleware).forRoutes('*path');
  }
}
