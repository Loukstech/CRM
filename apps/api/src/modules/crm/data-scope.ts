import type { TenantAuth } from '../../common/auth-context';
import { AppError } from '../../common/errors';

/**
 * Portée effective d'une lecture ou d'une écriture métier.
 *
 * Le catalogue connaît quatre portées (OWN, TEAM, DEPARTMENT, ORGANIZATION).
 * Seules OWN et ORGANIZATION sont calculables aujourd'hui : les équipes et les
 * départements arrivent au lot 2.5. Tant qu'ils n'existent pas, TEAM et
 * DEPARTMENT sont traités comme OWN — la portée la plus étroite. Une portée
 * qu'on ne sait pas calculer ne doit jamais élargir les droits.
 */
export type DataScope = 'OWN' | 'ORGANIZATION';

export function dataScopeOf(auth: TenantAuth, permissionKey: string): DataScope {
  const scope = auth.tenant.permissions.get(permissionKey);
  if (!scope) {
    throw AppError.forbidden('PERMISSION_DENIED', 'Permission insuffisante.');
  }
  return scope === 'ORGANIZATION' ? 'ORGANIZATION' : 'OWN';
}

/**
 * Filtre Prisma correspondant à la portée.
 *
 * En portée OWN, une ressource sans propriétaire (owner_membership_id NULL)
 * reste invisible : elle appartient à l'organisation, pas au portefeuille.
 */
export function ownerScopeFilter(auth: TenantAuth, scope: DataScope): { ownerMembershipId?: string } {
  return scope === 'OWN' ? { ownerMembershipId: auth.tenant.membershipId } : {};
}

/**
 * Propriétaire à enregistrer à la création.
 *
 * En portée OWN, on force le propriétaire à soi-même : attribuer une fiche à
 * un collègue est un acte de portée ORGANIZATION.
 */
export function resolveOwnerId(
  auth: TenantAuth,
  scope: DataScope,
  requested: string | null | undefined,
): string | null {
  if (scope === 'OWN') return auth.tenant.membershipId;
  if (requested === undefined) return auth.tenant.membershipId;
  return requested;
}

/** Charge une ressource modifiable : elle doit exister ET être dans la portée. */
export function assertInScope(scope: DataScope, ownedByMe: boolean): void {
  if (scope === 'OWN' && !ownedByMe) {
    throw AppError.forbidden(
      'OUT_OF_SCOPE',
      'Cette fiche appartient à un autre membre ; votre rôle ne couvre que vos propres fiches.',
    );
  }
}
