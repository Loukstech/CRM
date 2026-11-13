import { Injectable } from '@nestjs/common';
import type { TenantAccess } from '../../common/auth-context';
import { TenantDb } from '../../database/tenant-db.service';

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
}

/**
 * Résout, côté serveur, ce qu'un utilisateur a le droit de faire dans une
 * organisation. C'est le SEUL endroit qui transforme un identifiant
 * d'organisation reçu (jeton, corps de requête) en contexte tenant validé.
 */
@Injectable()
export class MembershipAccessService {
  constructor(private readonly db: TenantDb) {}

  /**
   * Retourne les droits de l'utilisateur dans l'organisation, ou null s'il
   * n'en est pas membre ACTIF ou si l'organisation n'est pas ACTIVE.
   */
  async load(userId: string, organizationId: string): Promise<TenantAccess | null> {
    const membership = await this.db.run({ organizationId, userId }, (tx) =>
      tx.membership.findFirst({
        where: {
          organizationId,
          userId,
          status: 'ACTIVE',
          organization: { status: 'ACTIVE' },
        },
        select: {
          id: true,
          roleId: true,
          role: {
            select: {
              systemKey: true,
              permissions: { select: { permissionKey: true, scope: true } },
            },
          },
        },
      }),
    );
    if (!membership) return null;

    return {
      organizationId,
      membershipId: membership.id,
      roleId: membership.roleId,
      roleSystemKey: membership.role.systemKey,
      permissions: new Map(membership.role.permissions.map((p) => [p.permissionKey, p.scope])),
    };
  }

  /** Organisations actives dont l'utilisateur est membre actif (contexte utilisateur seul). */
  async listOrganizations(userId: string): Promise<OrganizationSummary[]> {
    const memberships = await this.db.run({ userId }, (tx) =>
      tx.membership.findMany({
        where: { userId, status: 'ACTIVE', organization: { status: 'ACTIVE' } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { organization: { select: { id: true, name: true, slug: true } } },
      }),
    );
    return memberships.map((m) => m.organization);
  }
}
