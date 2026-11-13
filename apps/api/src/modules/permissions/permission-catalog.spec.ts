import { buildSlug } from '../organizations/organization-provisioner';
import {
  PERMISSIONS,
  type PermissionScopeName,
  SYSTEM_ROLES,
  findUngrantable,
  scopeCovers,
  validateGrants,
} from './permission-catalog';

describe('catalogue de permissions', () => {
  it('a des clés uniques au format domaine.action', () => {
    const keys = PERMISSIONS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key).toMatch(/^[a-z]+(\.[a-z_]+)+$/);
  });

  it('donne toutes les permissions au propriétaire et un socle minimal au membre', () => {
    const byKey = Object.fromEntries(SYSTEM_ROLES.map((r) => [r.key, r.permissions]));
    expect([...(byKey.owner ?? [])].sort()).toEqual(PERMISSIONS.map((p) => p.key).sort());
    expect(byKey.member).not.toContain('members.invite');
    expect(byKey.member).not.toContain('roles.manage');
  });

  describe('scopeCovers', () => {
    it.each<[PermissionScopeName, PermissionScopeName, boolean]>([
      ['ORGANIZATION', 'OWN', true],
      ['ORGANIZATION', 'ORGANIZATION', true],
      ['TEAM', 'OWN', true],
      ['OWN', 'TEAM', false],
      ['TEAM', 'DEPARTMENT', false],
      ['DEPARTMENT', 'ORGANIZATION', false],
    ])('%s couvre %s : %s', (held, wanted, expected) => {
      expect(scopeCovers(held, wanted)).toBe(expected);
    });
  });

  describe('findUngrantable (anti-élévation de privilèges)', () => {
    const held = new Map<string, PermissionScopeName>([
      ['roles.view', 'ORGANIZATION'],
      ['x.scoped', 'TEAM'],
    ]);

    it('autorise un sous-ensemble de ses propres permissions', () => {
      expect(
        findUngrantable(held, [
          { key: 'roles.view', scope: 'ORGANIZATION' },
          { key: 'x.scoped', scope: 'OWN' },
        ]),
      ).toEqual([]);
    });

    it('signale une permission non détenue ou une portée plus large que la sienne', () => {
      expect(
        findUngrantable(held, [
          { key: 'audit.view', scope: 'ORGANIZATION' },
          { key: 'x.scoped', scope: 'ORGANIZATION' },
        ]).map((g) => g.key),
      ).toEqual(['audit.view', 'x.scoped']);
    });

    it("ne permet rien à quelqu'un qui n'a aucune permission", () => {
      expect(findUngrantable(new Map(), [{ key: 'roles.view', scope: 'OWN' }])).toHaveLength(1);
    });
  });

  describe('validateGrants', () => {
    it('accepte une liste valide, y compris vide', () => {
      expect(validateGrants([])).toBeNull();
      expect(validateGrants([{ key: 'audit.view', scope: 'ORGANIZATION' }])).toBeNull();
    });

    it('rejette clé inconnue, doublon et portée invalide', () => {
      expect(validateGrants([{ key: 'nope.nope', scope: 'ORGANIZATION' }])).toMatch(/inconnue/);
      expect(
        validateGrants([
          { key: 'audit.view', scope: 'ORGANIZATION' },
          { key: 'audit.view', scope: 'ORGANIZATION' },
        ]),
      ).toMatch(/double/);
      expect(validateGrants([{ key: 'audit.view', scope: 'TEAM' }])).toMatch(/ORGANIZATION/);
    });
  });
});

describe('buildSlug', () => {
  it('translittère, nettoie et ajoute un suffixe aléatoire', () => {
    expect(buildSlug('  Éditions Côté-Mer & Fils  ')).toMatch(/^editions-cote-mer-fils-[0-9a-f]{8}$/);
  });

  it('reste valide pour un nom sans caractère latin ou très long', () => {
    expect(buildSlug('株式会社')).toMatch(/^org-[0-9a-f]{8}$/);
    const long = buildSlug('a'.repeat(300));
    expect(long.length).toBeLessThanOrEqual(80);
    expect(long).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('ne produit jamais deux fois le même identifiant', () => {
    expect(buildSlug('Acme')).not.toBe(buildSlug('Acme'));
  });
});
