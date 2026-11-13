import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentAuth, RequirePermissions, type TenantAuth, dbScopeOf } from '../../common/auth-context';
import { CursorPaginationQuery, cursorArgs, toPage } from '../../common/pagination';
import { TenantDb } from '../../database/tenant-db.service';

class AuditLogQuery extends CursorPaginationQuery {
  @ApiPropertyOptional({ example: 'member.role_changed' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  action?: string;

  @ApiPropertyOptional({ example: 'membership' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  entityType?: string;
}

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly db: TenantDb) {}

  /** Journal d'audit de l'organisation active, du plus récent au plus ancien. */
  @Get()
  @RequirePermissions('audit.view')
  async list(@CurrentAuth() auth: TenantAuth, @Query() query: AuditLogQuery) {
    const rows = await this.db.run(dbScopeOf(auth), (tx) =>
      tx.auditLog.findMany({
        where: {
          organizationId: auth.tenant.organizationId,
          ...(query.action ? { action: query.action } : {}),
          ...(query.entityType ? { entityType: query.entityType } : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          metadata: true,
          actorUserId: true,
          ip: true,
          requestId: true,
          createdAt: true,
        },
        ...cursorArgs(query),
      }),
    );
    return toPage(rows, query.limit);
  }
}
