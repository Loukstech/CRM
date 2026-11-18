import { Injectable } from '@nestjs/common';
import { type TenantAuth, dbScopeOf } from '../../common/auth-context';
import { AppError } from '../../common/errors';
import { isUniqueViolation } from '../../common/validators';
import { TenantDb } from '../../database/tenant-db.service';
import { AuditService } from '../audit/audit.service';
import type { CreateTagDto, TagListQuery, UpdateTagDto } from './dto/crm.dto';

const TAG_VIEW = {
  id: true,
  name: true,
  color: true,
  createdAt: true,
} as const;

@Injectable()
export class TagsService {
  constructor(
    private readonly db: TenantDb,
    private readonly audit: AuditService,
  ) {}

  async list(auth: TenantAuth, query: TagListQuery) {
    const { organizationId } = auth.tenant;
    const rows = await this.db.run(dbScopeOf(auth), (tx) =>
      tx.tag.findMany({
        where: {
          organizationId,
          ...(query.q ? { name: { contains: query.q, mode: 'insensitive' as const } } : {}),
        },
        orderBy: [{ name: 'asc' }],
        select: { ...TAG_VIEW, _count: { select: { contacts: true } } },
      }),
    );
    return query.withCount ? rows : rows.map(({ _count, ...tag }) => tag);
  }

  async create(auth: TenantAuth, dto: CreateTagDto) {
    const { organizationId } = auth.tenant;
    try {
      return await this.db.run(dbScopeOf(auth), async (tx) => {
        const tag = await tx.tag.create({
          data: {
            organizationId,
            name: dto.name,
            ...(dto.color ? { color: dto.color.toLowerCase() } : {}),
          },
          select: TAG_VIEW,
        });
        await this.audit.record(tx, {
          organizationId,
          actorUserId: auth.userId,
          action: 'tag.created',
          entityType: 'tag',
          entityId: tag.id,
          metadata: { name: tag.name },
        });
        return tag;
      });
    } catch (error) {
      throw this.mapConflict(error);
    }
  }

  async update(auth: TenantAuth, tagId: string, dto: UpdateTagDto) {
    if (dto.name === undefined && dto.color === undefined) {
      throw AppError.badRequest('NO_CHANGES', 'Aucune modification fournie.');
    }
    const { organizationId } = auth.tenant;
    try {
      return await this.db.run(dbScopeOf(auth), async (tx) => {
        const current = await tx.tag.findFirst({
          where: { id: tagId, organizationId },
          select: TAG_VIEW,
        });
        if (!current) throw AppError.notFound('Étiquette introuvable.');

        const tag = await tx.tag.update({
          where: { id: tagId },
          data: {
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.color !== undefined ? { color: dto.color.toLowerCase() } : {}),
          },
          select: TAG_VIEW,
        });
        await this.audit.record(tx, {
          organizationId,
          actorUserId: auth.userId,
          action: 'tag.updated',
          entityType: 'tag',
          entityId: tagId,
          metadata: { previousName: current.name, name: tag.name },
        });
        return tag;
      });
    } catch (error) {
      throw this.mapConflict(error);
    }
  }

  /** Les liens contact ↔ étiquette tombent en cascade (FK). */
  async remove(auth: TenantAuth, tagId: string): Promise<void> {
    const { organizationId } = auth.tenant;
    await this.db.run(dbScopeOf(auth), async (tx) => {
      const tag = await tx.tag.findFirst({ where: { id: tagId, organizationId }, select: TAG_VIEW });
      if (!tag) throw AppError.notFound('Étiquette introuvable.');

      await tx.tag.delete({ where: { id: tagId } });
      await this.audit.record(tx, {
        organizationId,
        actorUserId: auth.userId,
        action: 'tag.deleted',
        entityType: 'tag',
        entityId: tagId,
        metadata: { name: tag.name },
      });
    });
  }

  private mapConflict(error: unknown): unknown {
    return isUniqueViolation(error, 'Tag')
      ? AppError.conflict('TAG_NAME_TAKEN', 'Une étiquette porte déjà ce nom.')
      : error;
  }
}
