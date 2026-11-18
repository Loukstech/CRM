import { Injectable } from '@nestjs/common';
import type { MembershipStatus } from '@prisma/client';
import { type TenantAuth, dbScopeOf } from '../../common/auth-context';
import { AppError } from '../../common/errors';
import { type CursorPaginationQuery, cursorArgs, toPage } from '../../common/pagination';
import { TenantDb, type Tx } from '../../database/tenant-db.service';
import { AuditService } from '../audit/audit.service';
import { assertCanGrantRole } from '../roles/roles.service';

const ROLE_WITH_PERMISSIONS = {
  id: true,
  name: true,
  systemKey: true,
  permissions: { select: { permissionKey: true, scope: true } },
} as const;

const MEMBER_VIEW = {
  id: true,
  status: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true } },
  role: { select: { id: true, name: true, systemKey: true } },
} as const;

/**
 * Verrouille la ligne de l'organisation pour la durée de la transaction :
 * toutes les modifications de membres d'une même organisation sont ainsi
 * sérialisées, ce qui rend fiable le contrôle « au moins un propriétaire ».
 */
export async function lockOrganization(tx: Tx, organizationId: string): Promise<void> {
  await tx.$queryRaw`SELECT 1 FROM organizations WHERE id = ${organizationId}::uuid FOR UPDATE`;
}

/** Invariant : une organisation garde toujours au moins un propriétaire actif. */
export async function assertOwnerRemains(tx: Tx, organizationId: string): Promise<void> {
  const owners = await tx.membership.count({
    where: { organizationId, status: 'ACTIVE', role: { systemKey: 'owner' } },
  });
  if (owners === 0) {
    throw AppError.conflict('LAST_OWNER', "L'organisation doit conserver au moins un propriétaire actif.");
  }
}

@Injectable()
export class MembersService {
  constructor(
    private readonly db: TenantDb,
    private readonly audit: AuditService,
  ) {}

  async list(auth: TenantAuth, query: CursorPaginationQuery) {
    const rows = await this.db.run(dbScopeOf(auth), (tx) =>
      tx.membership.findMany({
        where: { organizationId: auth.tenant.organizationId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: MEMBER_VIEW,
        ...cursorArgs(query),
      }),
    );
    return toPage(rows, query.limit);
  }

  async update(
    auth: TenantAuth,
    membershipId: string,
    changes: { roleId?: string; status?: MembershipStatus },
  ) {
    if (changes.roleId === undefined && changes.status === undefined) {
      throw AppError.badRequest('NO_CHANGES', 'Aucune modification fournie.');
    }
    const { organizationId } = auth.tenant;

    return this.db.run(dbScopeOf(auth), async (tx) => {
      await lockOrganization(tx, organizationId);
      const target = await this.findManageableMember(tx, auth, membershipId);

      if (changes.roleId !== undefined && changes.roleId !== target.role.id) {
        const newRole = await tx.role.findFirst({
          where: { id: changes.roleId, organizationId },
          select: ROLE_WITH_PERMISSIONS,
        });
        if (!newRole) throw AppError.notFound('Rôle introuvable.');
        assertCanGrantRole(auth, newRole);
      }

      const updated = await tx.membership.update({
        where: { id: membershipId },
        data: {
          ...(changes.roleId !== undefined ? { roleId: changes.roleId } : {}),
          ...(changes.status !== undefined ? { status: changes.status } : {}),
        },
        select: MEMBER_VIEW,
      });
      await assertOwnerRemains(tx, organizationId);

      await this.audit.record(tx, {
        organizationId,
        actorUserId: auth.userId,
        action: 'member.updated',
        entityType: 'membership',
        entityId: membershipId,
        metadata: {
          userId: target.userId,
          previousRoleId: target.role.id,
          roleId: updated.role.id,
          previousStatus: target.status,
          status: updated.status,
        },
      });
      return updated;
    });
  }

  async remove(auth: TenantAuth, membershipId: string): Promise<void> {
    const { organizationId } = auth.tenant;
    await this.db.run(dbScopeOf(auth), async (tx) => {
      await lockOrganization(tx, organizationId);
      const target = await this.findManageableMember(tx, auth, membershipId);

      // Les fiches métier référencent le propriétaire par FK composite en
      // RESTRICT (une FK composite ne peut pas porter SET NULL) : on les
      // détache explicitement, sinon la suppression du membership échouerait.
      const [contacts, companies] = await Promise.all([
        tx.contact.updateMany({
          where: { organizationId, ownerMembershipId: membershipId },
          data: { ownerMembershipId: null },
        }),
        tx.company.updateMany({
          where: { organizationId, ownerMembershipId: membershipId },
          data: { ownerMembershipId: null },
        }),
      ]);

      await tx.membership.delete({ where: { id: membershipId } });
      await assertOwnerRemains(tx, organizationId);

      await this.audit.record(tx, {
        organizationId,
        actorUserId: auth.userId,
        action: 'member.removed',
        entityType: 'membership',
        entityId: membershipId,
        metadata: {
          userId: target.userId,
          roleId: target.role.id,
          detachedContacts: contacts.count,
          detachedCompanies: companies.count,
        },
      });
    });
  }

  /**
   * Charge un membre de l'organisation active que l'acteur a le droit de gérer :
   * jamais soi-même, jamais quelqu'un de plus privilégié que soi.
   */
  private async findManageableMember(tx: Tx, auth: TenantAuth, membershipId: string) {
    const target = await tx.membership.findFirst({
      where: { id: membershipId, organizationId: auth.tenant.organizationId },
      select: { id: true, userId: true, status: true, role: { select: ROLE_WITH_PERMISSIONS } },
    });
    if (!target) throw AppError.notFound('Membre introuvable.');
    if (target.userId === auth.userId) {
      throw AppError.forbidden(
        'CANNOT_MODIFY_SELF',
        'Vous ne pouvez pas modifier ou retirer votre propre accès.',
      );
    }
    assertCanGrantRole(auth, target.role);
    return target;
  }
}
