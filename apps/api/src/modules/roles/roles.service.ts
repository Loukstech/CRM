import { Injectable } from '@nestjs/common';
import { type TenantAuth, dbScopeOf } from '../../common/auth-context';
import { AppError } from '../../common/errors';
import { isUniqueViolation } from '../../common/validators';
import { TenantDb, type Tx } from '../../database/tenant-db.service';
import { AuditService } from '../audit/audit.service';
import {
  type PermissionGrant,
  type PermissionScopeName,
  findUngrantable,
  validateGrants,
} from '../permissions/permission-catalog';
import type { CreateRoleDto, UpdateRoleDto } from './dto/roles.dto';

const ROLE_VIEW = {
  id: true,
  name: true,
  description: true,
  systemKey: true,
  createdAt: true,
  updatedAt: true,
  permissions: { select: { permissionKey: true, scope: true }, orderBy: { permissionKey: 'asc' } },
} as const;

interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  systemKey: string | null;
  createdAt: Date;
  updatedAt: Date;
  permissions: { permissionKey: string; scope: PermissionScopeName }[];
}

function toView(role: RoleRow) {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    isSystem: role.systemKey !== null,
    systemKey: role.systemKey,
    permissions: role.permissions.map((p) => ({ key: p.permissionKey, scope: p.scope })),
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  };
}

/**
 * Règle anti-élévation de privilèges, partagée avec la gestion des membres :
 * on ne peut créer, modifier, supprimer ou ATTRIBUER un rôle que si l'on
 * détient soi-même toutes ses permissions (portée au moins égale), et seul un
 * propriétaire peut toucher au rôle propriétaire.
 */
export function assertCanGrantRole(
  auth: TenantAuth,
  role: {
    systemKey: string | null;
    permissions: readonly { permissionKey: string; scope: PermissionScopeName }[];
  },
): void {
  if (role.systemKey === 'owner' && auth.tenant.roleSystemKey !== 'owner') {
    throw AppError.forbidden('OWNER_REQUIRED', 'Seul un propriétaire peut effectuer cette action.');
  }
  assertCanGrant(
    auth,
    role.permissions.map((p) => ({ key: p.permissionKey, scope: p.scope })),
  );
}

function assertCanGrant(auth: TenantAuth, grants: readonly PermissionGrant[]): void {
  const ungrantable = findUngrantable(auth.tenant.permissions, grants);
  if (ungrantable.length > 0) {
    throw new AppError(
      403,
      'PRIVILEGE_ESCALATION',
      'Vous ne pouvez pas accorder des permissions que vous ne détenez pas.',
      ungrantable.map((g) => g.key),
    );
  }
}

@Injectable()
export class RolesService {
  constructor(
    private readonly db: TenantDb,
    private readonly audit: AuditService,
  ) {}

  async list(auth: TenantAuth) {
    const roles = await this.db.run(dbScopeOf(auth), (tx) =>
      tx.role.findMany({
        where: { organizationId: auth.tenant.organizationId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { ...ROLE_VIEW, _count: { select: { memberships: true } } },
      }),
    );
    return roles.map((role) => ({ ...toView(role), memberCount: role._count.memberships }));
  }

  async create(auth: TenantAuth, dto: CreateRoleDto) {
    const grants = this.checkedGrants(auth, dto.permissions);
    const { organizationId } = auth.tenant;

    try {
      return await this.db.run(dbScopeOf(auth), async (tx) => {
        const role = await tx.role.create({
          data: {
            organizationId,
            name: dto.name,
            description: dto.description ?? null,
            permissions: { create: grants.map((g) => ({ permissionKey: g.key, scope: g.scope })) },
          },
          select: ROLE_VIEW,
        });
        await this.audit.record(tx, {
          organizationId,
          actorUserId: auth.userId,
          action: 'role.created',
          entityType: 'role',
          entityId: role.id,
          metadata: { name: role.name, permissions: grants.map((g) => `${g.key}:${g.scope}`) },
        });
        return toView(role);
      });
    } catch (error) {
      throw this.mapNameConflict(error);
    }
  }

  async update(auth: TenantAuth, roleId: string, dto: UpdateRoleDto) {
    const grants = dto.permissions ? this.checkedGrants(auth, dto.permissions) : null;
    if (dto.name === undefined && dto.description === undefined && !grants) {
      throw AppError.badRequest('NO_CHANGES', 'Aucune modification fournie.');
    }
    const { organizationId } = auth.tenant;

    try {
      return await this.db.run(dbScopeOf(auth), async (tx) => {
        const current = await this.findEditableRole(tx, auth, roleId);

        if (grants) {
          await tx.rolePermission.deleteMany({ where: { organizationId, roleId } });
          await tx.rolePermission.createMany({
            data: grants.map((g) => ({ organizationId, roleId, permissionKey: g.key, scope: g.scope })),
          });
        }
        const role = await tx.role.update({
          where: { id: roleId },
          data: {
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.description !== undefined ? { description: dto.description } : {}),
          },
          select: ROLE_VIEW,
        });
        await this.audit.record(tx, {
          organizationId,
          actorUserId: auth.userId,
          action: 'role.updated',
          entityType: 'role',
          entityId: roleId,
          metadata: {
            previousName: current.name,
            name: role.name,
            ...(grants ? { permissions: grants.map((g) => `${g.key}:${g.scope}`) } : {}),
          },
        });
        return toView(role);
      });
    } catch (error) {
      throw this.mapNameConflict(error);
    }
  }

  async remove(auth: TenantAuth, roleId: string): Promise<void> {
    const { organizationId } = auth.tenant;
    await this.db.run(dbScopeOf(auth), async (tx) => {
      const role = await this.findEditableRole(tx, auth, roleId);

      const [members, pendingInvitations] = await Promise.all([
        tx.membership.count({ where: { organizationId, roleId } }),
        tx.invitation.count({ where: { organizationId, roleId, status: 'PENDING' } }),
      ]);
      if (members > 0 || pendingInvitations > 0) {
        throw AppError.conflict(
          'ROLE_IN_USE',
          'Ce rôle est attribué à des membres ou à des invitations en attente.',
        );
      }

      // Les invitations closes référencent encore le rôle ; leur trace reste dans l'audit.
      await tx.invitation.deleteMany({ where: { organizationId, roleId } });
      await tx.role.delete({ where: { id: roleId } });
      await this.audit.record(tx, {
        organizationId,
        actorUserId: auth.userId,
        action: 'role.deleted',
        entityType: 'role',
        entityId: roleId,
        metadata: { name: role.name },
      });
    });
  }

  /** Charge un rôle personnalisé de l'organisation que l'acteur a le droit de modifier. */
  private async findEditableRole(tx: Tx, auth: TenantAuth, roleId: string) {
    const role = await tx.role.findFirst({
      where: { id: roleId, organizationId: auth.tenant.organizationId },
      select: ROLE_VIEW,
    });
    if (!role) throw AppError.notFound('Rôle introuvable.');
    if (role.systemKey !== null) {
      throw AppError.forbidden('SYSTEM_ROLE_IMMUTABLE', 'Les rôles système ne sont pas modifiables.');
    }
    assertCanGrantRole(auth, role);
    return role;
  }

  private checkedGrants(
    auth: TenantAuth,
    requested: readonly { key: string; scope?: PermissionScopeName }[],
  ): PermissionGrant[] {
    const grants = requested.map((p) => ({ key: p.key, scope: p.scope ?? 'ORGANIZATION' }));
    const invalid = validateGrants(grants);
    if (invalid) throw AppError.badRequest('INVALID_PERMISSIONS', invalid);
    assertCanGrant(auth, grants);
    return grants;
  }

  private mapNameConflict(error: unknown): unknown {
    return isUniqueViolation(error, 'Role')
      ? AppError.conflict('ROLE_NAME_TAKEN', 'Un rôle porte déjà ce nom.')
      : error;
  }
}
