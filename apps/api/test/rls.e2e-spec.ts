import { Client } from 'pg';
import {
  API,
  type Session,
  type TestContext,
  bearer,
  createRole,
  createTestContext,
  http,
  invite,
  registerOwner,
  systemRoleId,
  uniqueEmail,
} from './helpers';
import { hashToken } from '../src/modules/auth/crypto';

/**
 * Défense en profondeur : ces tests contournent ENTIÈREMENT l'application et
 * interrogent PostgreSQL avec le rôle applicatif (crm_app), sans aucun filtre
 * organization_id. Ils prouvent que la base seule empêche l'accès croisé, même
 * si un développeur oublie un filtre dans un service.
 */
describe('Row Level Security (PostgreSQL, rôle applicatif)', () => {
  let ctx: TestContext;
  let app: Client;
  let ownerA: Session;
  let ownerB: Session;
  let invitationTokenB: string;

  const TENANT_TABLES = [
    'roles',
    'role_permissions',
    'memberships',
    'invitations',
    'audit_logs',
    'companies',
    'contacts',
    'tags',
    'contact_tags',
  ];

  /** Exécute `fn` dans une transaction portant le contexte donné, puis annule tout. */
  async function withContext<T>(
    scope: { org?: string; user?: string; invitationTokenHash?: string },
    fn: () => Promise<T>,
  ): Promise<T> {
    await app.query('BEGIN');
    try {
      await app.query(
        `SELECT set_config('app.current_org_id', $1, true),
                set_config('app.current_user_id', $2, true),
                set_config('app.invitation_token_hash', $3, true)`,
        [scope.org ?? '', scope.user ?? '', scope.invitationTokenHash ?? ''],
      );
      return await fn();
    } finally {
      await app.query('ROLLBACK');
    }
  }

  const count = async (sql: string, params: unknown[] = []) =>
    Number((await app.query(sql, params)).rows[0].n);

  beforeAll(async () => {
    ctx = await createTestContext();
    app = new Client({ connectionString: process.env.DATABASE_URL });
    await app.connect();

    ownerA = await registerOwner(ctx, 'rls-a');
    ownerB = await registerOwner(ctx, 'rls-b');
    await createRole(ctx, ownerA, 'Rôle A', ['members.view']);
    await createRole(ctx, ownerB, 'Rôle B', ['members.view']);
    await invite(ctx, ownerA, uniqueEmail('rls-a-inv'), await systemRoleId(ctx, ownerA, 'member'));
    invitationTokenB = (
      await invite(ctx, ownerB, uniqueEmail('rls-b-inv'), await systemRoleId(ctx, ownerB, 'member'))
    ).token;

    // Données métier de la phase 2.1 : sans elles, les tables `companies`,
    // `contacts`, `tags` et `contact_tags` seraient vides et le test « un SELECT
    // sans filtre ne renvoie que les lignes de A » passerait à vide.
    for (const [label, session] of [
      ['A', ownerA],
      ['B', ownerB],
    ] as const) {
      const tag = await http(ctx)
        .post(`${API}/tags`)
        .set('authorization', bearer(session))
        .send({ name: `Étiquette ${label}` })
        .expect(201);
      const company = await http(ctx)
        .post(`${API}/companies`)
        .set('authorization', bearer(session))
        .send({ name: `Entreprise ${label}` })
        .expect(201);
      await http(ctx)
        .post(`${API}/contacts`)
        .set('authorization', bearer(session))
        .send({
          lastName: `Contact ${label}`,
          companyId: (company.body as { id: string }).id,
          tagIds: [(tag.body as { id: string }).id],
        })
        .expect(201);
    }
  });
  afterAll(async () => {
    await app.end();
    await ctx.close();
  });

  describe('configuration', () => {
    it("le rôle applicatif n'est ni superutilisateur, ni BYPASSRLS, ni propriétaire des tables", async () => {
      const role = await app.query(
        'SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user',
      );
      expect(role.rows[0]).toEqual({ rolname: 'crm_app', rolsuper: false, rolbypassrls: false });

      const owned = await app.query(
        `SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public' AND tableowner = current_user`,
      );
      expect(owned.rows[0].n).toBe(0);
    });

    it('toute table portant organization_id a une RLS activée, forcée et au moins une policy', async () => {
      // Garde-fou pour les futures migrations : une nouvelle table tenant sans
      // RLS fait échouer ce test.
      const { rows } = await ctx.admin.query(`
        SELECT c.relname AS table_name,
               c.relrowsecurity AS enabled,
               c.relforcerowsecurity AS forced,
               (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
          AND (
            c.relname = 'organizations'
            OR EXISTS (
              SELECT 1 FROM pg_attribute a
              WHERE a.attrelid = c.oid AND a.attname = 'organization_id' AND NOT a.attisdropped
            )
          )
        ORDER BY c.relname`);

      expect(rows.map((r) => r.table_name)).toEqual([...TENANT_TABLES, 'organizations'].sort());
      for (const row of rows) {
        expect(row).toMatchObject({ enabled: true, forced: true });
        expect(row.policies).toBeGreaterThan(0);
      }
    });
  });

  describe('sans contexte', () => {
    it("aucune ligne d'aucune table tenant n'est visible (fail closed)", async () => {
      for (const table of [...TENANT_TABLES, 'organizations']) {
        expect(await count(`SELECT count(*) AS n FROM ${table}`)).toBe(0);
      }
    });

    it('le contexte ne survit pas à la transaction (pas de fuite via le pool de connexions)', async () => {
      await withContext({ org: ownerA.organizationId, user: ownerA.userId }, async () => {
        expect(await count('SELECT count(*) AS n FROM roles')).toBeGreaterThan(0);
      });
      const after = await app.query('SELECT app_current_org_id() AS org, app_current_user_id() AS usr');
      expect(after.rows[0]).toEqual({ org: null, usr: null });
      expect(await count('SELECT count(*) AS n FROM roles')).toBe(0);
    });
  });

  describe("dans le contexte de l'organisation A", () => {
    const scopeA = () => ({ org: ownerA.organizationId, user: ownerA.userId });

    it('un SELECT sans filtre ne renvoie que les lignes de A', async () => {
      await withContext(scopeA(), async () => {
        for (const table of TENANT_TABLES) {
          const { rows } = await app.query(
            `SELECT count(*)::int AS total,
                    count(*) FILTER (WHERE organization_id = $1)::int AS own
             FROM ${table}`,
            [ownerA.organizationId],
          );
          expect(rows[0].total).toBeGreaterThan(0);
          expect(rows[0].total).toBe(rows[0].own);
        }
        const orgs = await app.query('SELECT id FROM organizations');
        expect(orgs.rows).toEqual([{ id: ownerA.organizationId }]);
      });
    });

    it('UPDATE et DELETE visant B ne touchent aucune ligne', async () => {
      await withContext(scopeA(), async () => {
        const update = await app.query(`UPDATE roles SET name = 'pirate' WHERE organization_id = $1`, [
          ownerB.organizationId,
        ]);
        const remove = await app.query('DELETE FROM memberships WHERE organization_id = $1', [
          ownerB.organizationId,
        ]);
        const org = await app.query(`UPDATE organizations SET name = 'pirate' WHERE id = $1`, [
          ownerB.organizationId,
        ]);
        expect([update.rowCount, remove.rowCount, org.rowCount]).toEqual([0, 0, 0]);
      });
      const intact = await ctx.admin.query(
        `SELECT count(*)::int AS n FROM roles WHERE organization_id = $1 AND name = 'pirate'`,
        [ownerB.organizationId],
      );
      expect(intact.rows[0].n).toBe(0);
    });

    it('INSERT dans B est rejeté par la policy', async () => {
      await withContext(scopeA(), async () => {
        await expect(
          app.query(`INSERT INTO roles (organization_id, name, updated_at) VALUES ($1, 'intrus', now())`, [
            ownerB.organizationId,
          ]),
        ).rejects.toMatchObject({ code: '42501' });
      });
    });

    it('déplacer une ligne de A vers B est rejeté (WITH CHECK)', async () => {
      await withContext(scopeA(), async () => {
        await expect(
          app.query(`UPDATE roles SET organization_id = $1 WHERE name = 'Rôle A'`, [ownerB.organizationId]),
        ).rejects.toMatchObject({ code: '42501' });
      });
    });

    it("le membership de l'utilisateur dans une autre organisation reste invisible", async () => {
      // On rattache ownerA à B (hors RLS), puis on vérifie qu'en contexte A il ne le voit pas.
      const roleB = await ctx.admin.query(
        `SELECT id FROM roles WHERE organization_id = $1 AND system_key = 'member'`,
        [ownerB.organizationId],
      );
      await ctx.admin.query(
        `INSERT INTO memberships (organization_id, user_id, role_id, updated_at) VALUES ($1, $2, $3, now())`,
        [ownerB.organizationId, ownerA.userId, roleB.rows[0].id],
      );
      try {
        await withContext(scopeA(), async () => {
          const { rows } = await app.query('SELECT DISTINCT organization_id FROM memberships');
          expect(rows).toEqual([{ organization_id: ownerA.organizationId }]);
        });
        // Hors contexte d'organisation, l'utilisateur voit SES memberships (sélecteur d'organisation)…
        await withContext({ user: ownerA.userId }, async () => {
          const own = await app.query('SELECT DISTINCT user_id FROM memberships');
          expect(own.rows).toEqual([{ user_id: ownerA.userId }]);
          const orgs = await app.query('SELECT id FROM organizations ORDER BY id');
          expect(orgs.rows.map((r) => r.id)).toEqual([ownerA.organizationId, ownerB.organizationId].sort());
          // …mais toujours aucune donnée interne des organisations.
          expect(await count('SELECT count(*) AS n FROM roles')).toBe(0);
          expect(await count('SELECT count(*) AS n FROM audit_logs')).toBe(0);
        });
      } finally {
        await ctx.admin.query('DELETE FROM memberships WHERE organization_id = $1 AND user_id = $2', [
          ownerB.organizationId,
          ownerA.userId,
        ]);
      }
    });
  });

  describe('invitations', () => {
    it("un jeton d'invitation ne révèle que l'invitation correspondante", async () => {
      await withContext({ invitationTokenHash: hashToken(invitationTokenB) }, async () => {
        const { rows } = await app.query('SELECT organization_id FROM invitations');
        expect(rows).toEqual([{ organization_id: ownerB.organizationId }]);
      });
      await withContext({ invitationTokenHash: hashToken('jeton-inexistant') }, async () => {
        expect(await count('SELECT count(*) AS n FROM invitations')).toBe(0);
      });
    });
  });

  describe('intégrité et privilèges', () => {
    it("une clé étrangère composite interdit d'attribuer le rôle d'une autre organisation", async () => {
      // Même le superutilisateur (qui ignore la RLS) est bloqué par la contrainte.
      const roleB = await ctx.admin.query(
        `SELECT id FROM roles WHERE organization_id = $1 AND system_key = 'member'`,
        [ownerB.organizationId],
      );
      await expect(
        ctx.admin.query(`UPDATE memberships SET role_id = $1 WHERE organization_id = $2 AND user_id = $3`, [
          roleB.rows[0].id,
          ownerA.organizationId,
          ownerA.userId,
        ]),
      ).rejects.toMatchObject({ code: '23503' });
    });

    it("le journal d'audit est en ajout seul pour l'application", async () => {
      await expect(app.query(`UPDATE audit_logs SET action = 'x'`)).rejects.toMatchObject({ code: '42501' });
      await expect(app.query('DELETE FROM audit_logs')).rejects.toMatchObject({ code: '42501' });
    });

    it("l'application ne peut ni modifier le catalogue de permissions ni supprimer une organisation ou un utilisateur", async () => {
      await expect(
        app.query(`INSERT INTO permissions (key, description) VALUES ('x.y', 'z')`),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(app.query('DELETE FROM organizations')).rejects.toMatchObject({ code: '42501' });
      await expect(app.query('DELETE FROM users')).rejects.toMatchObject({ code: '42501' });
      await expect(app.query('SELECT * FROM _prisma_migrations')).rejects.toMatchObject({ code: '42501' });
    });

    it("les événements d'audit hors tenant sont inscriptibles mais illisibles par un tenant", async () => {
      const total = await ctx.admin.query(
        'SELECT count(*)::int AS n FROM audit_logs WHERE organization_id IS NULL',
      );
      expect(total.rows[0].n).toBeGreaterThan(0);
      await withContext({ org: ownerA.organizationId, user: ownerA.userId }, async () => {
        expect(await count('SELECT count(*) AS n FROM audit_logs WHERE organization_id IS NULL')).toBe(0);
      });
    });
  });
});
