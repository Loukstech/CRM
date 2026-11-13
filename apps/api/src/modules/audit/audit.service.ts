import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { currentRequestMeta } from '../../common/request-context';
import type { Tx } from '../../database/tenant-db.service';

export interface AuditEntry {
  /** null = événement d'identité hors tenant (connexion, mot de passe…). */
  organizationId: string | null;
  actorUserId: string | null;
  /** Verbe stable : `domaine.action` (ex. member.role_changed). */
  action: string;
  entityType: string;
  entityId?: string | null;
  /** Ne jamais y mettre de secret, de jeton ni de mot de passe. */
  metadata?: Prisma.InputJsonObject;
}

type AuditWriter = Pick<Tx, 'auditLog'>;

@Injectable()
export class AuditService {
  /**
   * Écrit une entrée d'audit dans la transaction fournie : l'action et sa
   * trace sont validées ou annulées ensemble.
   *
   * `createMany` est volontaire : il émet un INSERT sans RETURNING. Un
   * `create` relirait la ligne, ce que la policy SELECT interdit pour les
   * événements hors tenant (organization_id NULL).
   */
  async record(db: AuditWriter, entry: AuditEntry): Promise<void> {
    const meta = currentRequestMeta();
    await db.auditLog.createMany({
      data: [
        {
          organizationId: entry.organizationId,
          actorUserId: entry.actorUserId,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId ?? null,
          metadata: entry.metadata ?? {},
          ip: meta.ip,
          userAgent: meta.userAgent,
          requestId: meta.requestId,
        },
      ],
    });
  }
}
