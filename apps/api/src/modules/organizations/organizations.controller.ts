import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import {
  type AuthUser,
  CurrentAuth,
  RequirePermissions,
  type TenantAuth,
  UserScoped,
  dbScopeOf,
} from '../../common/auth-context';
import { AppError } from '../../common/errors';
import { IsCountryCode, IsCurrencyCode, IsDisplayName, IsIanaTimezone } from '../../common/validators';
import { TenantDb } from '../../database/tenant-db.service';
import { AuditService } from '../audit/audit.service';
import { MembershipAccessService } from '../auth/membership-access.service';
import { OrganizationProvisioner } from './organization-provisioner';

const SUPPORTED_LOCALES = ['fr'] as const;

class CreateOrganizationDto {
  @ApiProperty({ example: 'Acme SARL' })
  @IsDisplayName(200)
  name: string;

  @ApiProperty({ example: 'BJ' })
  @IsCountryCode()
  country: string;

  @ApiProperty({ example: 'XOF' })
  @IsCurrencyCode()
  currency: string;

  @ApiProperty({ example: 'Africa/Porto-Novo' })
  @IsIanaTimezone()
  timezone: string;
}

class UpdateOrganizationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDisplayName(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsCountryCode()
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsCurrencyCode()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIanaTimezone()
  timezone?: string;

  @ApiPropertyOptional({ enum: SUPPORTED_LOCALES })
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  locale?: (typeof SUPPORTED_LOCALES)[number];
}

const ORGANIZATION_VIEW = {
  id: true,
  name: true,
  slug: true,
  country: true,
  currency: true,
  timezone: true,
  locale: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

@ApiTags('organizations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly db: TenantDb,
    private readonly access: MembershipAccessService,
    private readonly provisioner: OrganizationProvisioner,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @UserScoped()
  @ApiOperation({ summary: "Organisations dont l'utilisateur est membre actif" })
  listMine(@CurrentAuth() auth: AuthUser) {
    return this.access.listOrganizations(auth.userId);
  }

  @Post()
  @UserScoped()
  @ApiOperation({ summary: "Créer une organisation supplémentaire (l'auteur en devient propriétaire)" })
  async create(@CurrentAuth() auth: AuthUser, @Body() dto: CreateOrganizationDto) {
    if (!auth.emailVerified) {
      throw AppError.forbidden(
        'EMAIL_NOT_VERIFIED',
        'Confirmez votre adresse e-mail avant de créer une autre organisation.',
      );
    }
    const { organization } = await this.db.run({ userId: auth.userId }, (tx) =>
      this.provisioner.provision(tx, auth.userId, dto),
    );
    return { id: organization.id, name: organization.name, slug: organization.slug };
  }

  @Get('current')
  @RequirePermissions('organization.view')
  @ApiOperation({ summary: "Profil de l'organisation active" })
  current(@CurrentAuth() auth: TenantAuth) {
    return this.db.run(dbScopeOf(auth), (tx) =>
      tx.organization.findUniqueOrThrow({
        where: { id: auth.tenant.organizationId },
        select: ORGANIZATION_VIEW,
      }),
    );
  }

  @Patch('current')
  @RequirePermissions('organization.update')
  @ApiOperation({ summary: "Modifier le profil de l'organisation active" })
  updateCurrent(@CurrentAuth() auth: TenantAuth, @Body() dto: UpdateOrganizationDto) {
    const changes = Object.fromEntries(Object.entries(dto).filter(([, value]) => value !== undefined));
    if (Object.keys(changes).length === 0) {
      throw AppError.badRequest('NO_CHANGES', 'Aucune modification fournie.');
    }
    return this.db.run(dbScopeOf(auth), async (tx) => {
      const organization = await tx.organization.update({
        where: { id: auth.tenant.organizationId },
        data: changes,
        select: ORGANIZATION_VIEW,
      });
      await this.audit.record(tx, {
        organizationId: auth.tenant.organizationId,
        actorUserId: auth.userId,
        action: 'organization.updated',
        entityType: 'organization',
        entityId: auth.tenant.organizationId,
        metadata: { fields: Object.keys(changes) },
      });
      return organization;
    });
  }
}
