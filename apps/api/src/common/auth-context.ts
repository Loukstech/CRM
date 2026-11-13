import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { PermissionKey, PermissionScopeName } from '../modules/permissions/permission-catalog';
import type { DbScope } from '../database/tenant-db.service';

/** Organisation active et droits de l'utilisateur dans celle-ci. */
export interface TenantAccess {
  organizationId: string;
  membershipId: string;
  roleId: string;
  /** owner | admin | member, ou null pour un rôle personnalisé. */
  roleSystemKey: string | null;
  /** Permissions effectives : clé -> portée accordée. */
  permissions: ReadonlyMap<string, PermissionScopeName>;
}

/** Identité authentifiée, résolue côté serveur à chaque requête. */
export interface AuthUser {
  userId: string;
  sessionId: string;
  emailVerified: boolean;
  /** null si l'utilisateur n'a pas (ou plus) d'organisation active valide. */
  tenant: TenantAccess | null;
}

/** Identité + organisation active garantie (routes protégées par permission). */
export interface TenantAuth extends AuthUser {
  tenant: TenantAccess;
}

export function dbScopeOf(auth: TenantAuth): DbScope {
  return { organizationId: auth.tenant.organizationId, userId: auth.userId };
}

export type AuthenticatedRequest = Request & { auth?: AuthUser };

// ─────────────── Politique d'accès des routes (refus par défaut) ───────────────
// Toute route doit déclarer EXACTEMENT une des trois politiques ci-dessous.
// Une route sans politique est refusée par AccessGuard et fait échouer
// le test access-policy.e2e-spec.ts.

export const ACCESS_POLICY = 'crm:access-policy';

export type AccessPolicy =
  { kind: 'public' } | { kind: 'user' } | { kind: 'permissions'; permissions: readonly PermissionKey[] };

/** Route accessible sans authentification (inscription, connexion, santé…). */
export const Public = () => SetMetadata<string, AccessPolicy>(ACCESS_POLICY, { kind: 'public' });

/**
 * Route authentifiée mais hors organisation : ne manipule que les données de
 * l'utilisateur lui-même (profil, liste de ses organisations, changement
 * d'organisation active…).
 */
export const UserScoped = () => SetMetadata<string, AccessPolicy>(ACCESS_POLICY, { kind: 'user' });

/**
 * Route métier : exige une organisation active ET toutes les permissions listées.
 */
export const RequirePermissions = (...permissions: [PermissionKey, ...PermissionKey[]]) =>
  SetMetadata<string, AccessPolicy>(ACCESS_POLICY, { kind: 'permissions', permissions });

/** Injecte l'identité authentifiée dans un handler. */
export const CurrentAuth = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!request.auth) {
    // Ne peut arriver que si le décorateur est utilisé sur une route @Public().
    throw new Error('@CurrentAuth() utilisé sur une route sans authentification.');
  }
  return request.auth;
});
