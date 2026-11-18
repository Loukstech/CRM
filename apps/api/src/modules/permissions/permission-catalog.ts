/**
 * Catalogue des permissions — SOURCE DE VÉRITÉ.
 *
 * Fichier volontairement sans dépendance (ni NestJS ni Prisma) : il est importé
 * par l'API, par prisma/sync-permissions.ts et, plus tard, par le frontend.
 *
 * Chaque module métier ajoute ici ses permissions dans la phase où il est
 * développé. Ne jamais déclarer une permission pour un module qui n'existe pas.
 */

export const PERMISSION_SCOPES = ['OWN', 'TEAM', 'DEPARTMENT', 'ORGANIZATION'] as const;
export type PermissionScopeName = (typeof PERMISSION_SCOPES)[number];

export interface PermissionDefinition {
  readonly key: string;
  readonly description: string;
  /**
   * true  : la permission porte sur des ressources ayant un propriétaire ; elle
   *         peut être accordée avec une portée OWN/TEAM/DEPARTMENT/ORGANIZATION.
   * false : permission d'administration ; seule la portée ORGANIZATION a un sens.
   */
  readonly scoped: boolean;
}

export const PERMISSIONS = [
  { key: 'organization.view', description: "Consulter le profil de l'organisation", scoped: false },
  { key: 'organization.update', description: "Modifier le profil de l'organisation", scoped: false },
  { key: 'members.view', description: 'Consulter les membres et les invitations', scoped: false },
  { key: 'members.invite', description: 'Inviter des membres et révoquer des invitations', scoped: false },
  { key: 'members.update', description: "Modifier le rôle ou le statut d'un membre", scoped: false },
  { key: 'members.remove', description: "Retirer un membre de l'organisation", scoped: false },
  { key: 'roles.view', description: 'Consulter les rôles et leurs permissions', scoped: false },
  { key: 'roles.manage', description: 'Créer, modifier et supprimer des rôles personnalisés', scoped: false },
  { key: 'audit.view', description: "Consulter le journal d'audit de l'organisation", scoped: false },
  // Phase 2.1 — contacts, entreprises, étiquettes.
  // `scoped: true` : ces permissions portent sur des ressources qui ont un
  // propriétaire (membership), donc les portées OWN → ORGANIZATION s'appliquent.
  { key: 'contacts.view', description: 'Consulter les contacts', scoped: true },
  { key: 'contacts.create', description: 'Créer des contacts', scoped: true },
  { key: 'contacts.update', description: 'Modifier les contacts', scoped: true },
  { key: 'contacts.delete', description: 'Supprimer des contacts', scoped: true },
  { key: 'companies.view', description: 'Consulter les entreprises', scoped: true },
  { key: 'companies.manage', description: 'Créer, modifier et supprimer des entreprises', scoped: true },
  { key: 'tags.manage', description: 'Créer, renommer et supprimer les étiquettes', scoped: false },
] as const satisfies readonly PermissionDefinition[];

export type PermissionKey = (typeof PERMISSIONS)[number]['key'];

export const PERMISSION_KEYS: readonly PermissionKey[] = PERMISSIONS.map((p) => p.key);

const DEFINITIONS = new Map<string, PermissionDefinition>(PERMISSIONS.map((p) => [p.key, p]));

export function getPermissionDefinition(key: string): PermissionDefinition | undefined {
  return DEFINITIONS.get(key);
}

/** Rôles système créés automatiquement dans chaque organisation. */
export const SYSTEM_ROLE_KEYS = ['owner', 'admin', 'member'] as const;
export type SystemRoleKey = (typeof SYSTEM_ROLE_KEYS)[number];

export interface SystemRoleDefinition {
  readonly key: SystemRoleKey;
  readonly name: string;
  readonly description: string;
  readonly permissions: readonly PermissionKey[];
}

export const SYSTEM_ROLES: readonly SystemRoleDefinition[] = [
  {
    key: 'owner',
    name: 'Propriétaire',
    description: 'Accès complet. Au moins un propriétaire actif est requis par organisation.',
    permissions: PERMISSION_KEYS,
  },
  {
    key: 'admin',
    name: 'Administrateur',
    description: "Administration de l'organisation, des membres et des rôles.",
    permissions: PERMISSION_KEYS,
  },
  {
    key: 'member',
    name: 'Membre',
    description: 'Accès de base en lecture à l’organisation et à ses membres.',
    permissions: [
      'organization.view',
      'members.view',
      'roles.view',
      'contacts.view',
      'contacts.create',
      'contacts.update',
      'companies.view',
      'companies.manage',
    ],
  },
];

const SCOPE_RANK: Record<PermissionScopeName, number> = {
  OWN: 1,
  TEAM: 2,
  DEPARTMENT: 3,
  ORGANIZATION: 4,
};

/** Vrai si la portée `held` couvre au moins la portée `wanted`. */
export function scopeCovers(held: PermissionScopeName, wanted: PermissionScopeName): boolean {
  return SCOPE_RANK[held] >= SCOPE_RANK[wanted];
}

export interface PermissionGrant {
  readonly key: string;
  readonly scope: PermissionScopeName;
}

/**
 * Règle anti-élévation de privilèges : on ne peut accorder (via un rôle) que
 * des permissions que l'on détient soi-même, avec une portée au plus égale.
 * Retourne la liste des permissions qui violent la règle (vide = autorisé).
 */
export function findUngrantable(
  held: ReadonlyMap<string, PermissionScopeName>,
  wanted: readonly PermissionGrant[],
): PermissionGrant[] {
  return wanted.filter((grant) => {
    const heldScope = held.get(grant.key);
    return heldScope === undefined || !scopeCovers(heldScope, grant.scope);
  });
}

/**
 * Valide une liste de permissions demandée pour un rôle.
 * Retourne un message d'erreur, ou null si la liste est valide.
 */
export function validateGrants(grants: readonly PermissionGrant[]): string | null {
  const seen = new Set<string>();
  for (const grant of grants) {
    const definition = DEFINITIONS.get(grant.key);
    if (!definition) return `Permission inconnue : ${grant.key}`;
    if (seen.has(grant.key)) return `Permission en double : ${grant.key}`;
    seen.add(grant.key);
    if (!definition.scoped && grant.scope !== 'ORGANIZATION') {
      return `La permission ${grant.key} n'accepte que la portée ORGANIZATION`;
    }
  }
  return null;
}
