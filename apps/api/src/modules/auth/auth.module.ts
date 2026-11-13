import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { APP_CONFIG, type AppConfig } from '../../config/env';
import { OrganizationProvisioner } from '../organizations/organization-provisioner';
import { AccessGuard } from './access.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './crypto';
import { MembershipAccessService } from './membership-access.service';
import { JWT_AUDIENCE, JWT_ISSUER, SessionService } from './session.service';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        secret: config.JWT_ACCESS_SECRET,
        signOptions: {
          algorithm: 'HS256',
          expiresIn: config.JWT_ACCESS_TTL_SECONDS,
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
        },
        // Algorithme imposé à la vérification : empêche toute confusion d'algorithme.
        verifyOptions: { algorithms: ['HS256'], issuer: JWT_ISSUER, audience: JWT_AUDIENCE },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    SessionService,
    MembershipAccessService,
    OrganizationProvisioner,
    { provide: APP_GUARD, useClass: AccessGuard },
  ],
  exports: [AuthService, PasswordService, SessionService, MembershipAccessService, OrganizationProvisioner],
})
export class AuthModule {}
