import { createHmac } from 'node:crypto';
import {
  API,
  PASSWORD,
  type TestContext,
  bearer,
  createTestContext,
  errorCode,
  http,
  login,
  registerOwner,
  uniqueEmail,
} from './helpers';

const registration = (email: string, overrides: Record<string, unknown> = {}) => ({
  email,
  password: PASSWORD,
  name: 'Ada Lovelace',
  organizationName: 'Société Générale d’Électricité',
  country: 'BJ',
  currency: 'XOF',
  timezone: 'Africa/Porto-Novo',
  ...overrides,
});

describe('Authentification', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });

  describe('inscription', () => {
    it("crée le compte, l'organisation, les rôles système et une session propriétaire", async () => {
      const email = uniqueEmail('register');
      const response = await http(ctx).post(`${API}/auth/register`).send(registration(email)).expect(201);

      expect(response.body.user).toMatchObject({ email, emailVerified: false });
      expect(response.body.organizations).toHaveLength(1);
      expect(response.body.organizations[0].slug).toMatch(/^societe-generale-d-electricite-[0-9a-f]{8}$/);
      expect(JSON.stringify(response.body)).not.toContain('passwordHash');

      const me = await http(ctx)
        .get(`${API}/auth/me`)
        .set('authorization', bearer(response.body.tokens.accessToken))
        .expect(200);
      expect(me.body.active.roleSystemKey).toBe('owner');
      expect(me.body.active.organizationId).toBe(response.body.activeOrganizationId);
      expect(me.body.active.permissions.map((p: { key: string }) => p.key)).toEqual(
        expect.arrayContaining(['members.invite', 'roles.manage', 'audit.view']),
      );

      const roles = await http(ctx)
        .get(`${API}/roles`)
        .set('authorization', bearer(response.body.tokens.accessToken))
        .expect(200);
      expect(roles.body.map((r: { systemKey: string }) => r.systemKey).sort()).toEqual([
        'admin',
        'member',
        'owner',
      ]);
    });

    it('normalise l’e-mail et refuse un doublon, quelle que soit la casse', async () => {
      const email = uniqueEmail('dup');
      await http(ctx).post(`${API}/auth/register`).send(registration(email)).expect(201);
      const response = await http(ctx)
        .post(`${API}/auth/register`)
        .send(registration(`  ${email.toUpperCase()} `))
        .expect(409);
      expect(errorCode(response)).toBe('EMAIL_ALREADY_REGISTERED');
    });

    it.each([
      ['mot de passe trop court', { password: 'court' }],
      ['devise inconnue', { currency: 'ZZZ' }],
      ['pays inconnu', { country: 'ZZ' }],
      ['fuseau invalide', { timezone: 'Mars/Olympus' }],
      ['e-mail invalide', { email: 'pas-un-email' }],
      ['champ non prévu', { isAdmin: true }],
    ])('rejette une inscription invalide : %s', async (_label, overrides) => {
      const response = await http(ctx)
        .post(`${API}/auth/register`)
        .send(registration(uniqueEmail('invalid'), overrides))
        .expect(400);
      expect(response.body.error).toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(response.body.error.requestId).toEqual(expect.any(String));
    });

    it('stocke le mot de passe haché en Argon2id, jamais en clair', async () => {
      const owner = await registerOwner(ctx, 'hash');
      const { rows } = await ctx.admin.query('SELECT password_hash FROM users WHERE id = $1', [owner.userId]);
      expect(rows[0].password_hash).toMatch(/^\$argon2id\$/);
      expect(rows[0].password_hash).not.toContain(PASSWORD);
    });
  });

  describe('connexion', () => {
    it('refuse un mauvais mot de passe et un compte inconnu avec la même réponse', async () => {
      const owner = await registerOwner(ctx, 'login');
      const wrong = await http(ctx)
        .post(`${API}/auth/login`)
        .send({ email: owner.email, password: 'Mauvais-mot-de-passe-1' })
        .expect(401);
      const unknown = await http(ctx)
        .post(`${API}/auth/login`)
        .send({ email: uniqueEmail('ghost'), password: 'Mauvais-mot-de-passe-1' })
        .expect(401);
      expect(errorCode(wrong)).toBe('INVALID_CREDENTIALS');
      expect(wrong.body.error.message).toBe(unknown.body.error.message);
      expect(errorCode(unknown)).toBe('INVALID_CREDENTIALS');
    });

    it('verrouille le compte après 5 échecs, même avec le bon mot de passe ensuite', async () => {
      const owner = await registerOwner(ctx, 'lock');
      for (let attempt = 0; attempt < 5; attempt++) {
        await http(ctx)
          .post(`${API}/auth/login`)
          .send({ email: owner.email, password: 'Mauvais-mot-de-passe-1' })
          .expect(401);
      }
      const locked = await http(ctx)
        .post(`${API}/auth/login`)
        .send({ email: owner.email, password: owner.password })
        .expect(429);
      expect(errorCode(locked)).toBe('ACCOUNT_LOCKED');
    });

    it('refuse un compte désactivé et invalide ses sessions existantes', async () => {
      const owner = await registerOwner(ctx, 'disabled');
      await ctx.admin.query(`UPDATE users SET status = 'DISABLED' WHERE id = $1`, [owner.userId]);

      const response = await http(ctx)
        .post(`${API}/auth/login`)
        .send({ email: owner.email, password: owner.password })
        .expect(403);
      expect(errorCode(response)).toBe('ACCOUNT_DISABLED');
      await http(ctx).get(`${API}/auth/me`).set('authorization', bearer(owner)).expect(401);
    });
  });

  describe("jeton d'accès", () => {
    it('exige un jeton valide sur les routes protégées', async () => {
      const missing = await http(ctx).get(`${API}/auth/me`).expect(401);
      expect(errorCode(missing)).toBe('UNAUTHENTICATED');

      const garbage = await http(ctx)
        .get(`${API}/auth/me`)
        .set('authorization', 'Bearer abc.def.ghi')
        .expect(401);
      expect(errorCode(garbage)).toBe('INVALID_TOKEN');
    });

    it('rejette un jeton signé avec un autre secret ou sans signature (alg none)', async () => {
      const owner = await registerOwner(ctx, 'forge');
      const [, payload] = owner.accessToken.split('.') as [string, string, string];
      const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

      const header = encode({ alg: 'HS256', typ: 'JWT' });
      const signature = createHmac('sha256', 'un-autre-secret-de-32-caracteres-min')
        .update(`${header}.${payload}`)
        .digest('base64url');
      await http(ctx)
        .get(`${API}/auth/me`)
        .set('authorization', `Bearer ${header}.${payload}.${signature}`)
        .expect(401);

      const unsigned = `${encode({ alg: 'none', typ: 'JWT' })}.${payload}.`;
      await http(ctx).get(`${API}/auth/me`).set('authorization', `Bearer ${unsigned}`).expect(401);
    });
  });

  describe('sessions', () => {
    it('fait tourner le jeton de rafraîchissement et ne stocke que son empreinte', async () => {
      const owner = await registerOwner(ctx, 'refresh');
      const refreshed = await http(ctx)
        .post(`${API}/auth/refresh`)
        .send({ refreshToken: owner.refreshToken })
        .expect(200);

      expect(refreshed.body.tokens.refreshToken).not.toBe(owner.refreshToken);
      expect(refreshed.body.activeOrganizationId).toBe(owner.organizationId);
      await http(ctx)
        .get(`${API}/organizations/current`)
        .set('authorization', bearer(refreshed.body.tokens.accessToken))
        .expect(200);

      const { rows } = await ctx.admin.query(
        'SELECT count(*)::int AS n FROM refresh_tokens WHERE token_hash IN ($1, $2)',
        [owner.refreshToken, refreshed.body.tokens.refreshToken],
      );
      expect(rows[0].n).toBe(0);
    });

    it('révoque toute la session si un jeton de rafraîchissement est rejoué', async () => {
      const owner = await registerOwner(ctx, 'reuse');
      const refreshed = await http(ctx)
        .post(`${API}/auth/refresh`)
        .send({ refreshToken: owner.refreshToken })
        .expect(200);

      const replay = await http(ctx)
        .post(`${API}/auth/refresh`)
        .send({ refreshToken: owner.refreshToken })
        .expect(401);
      expect(errorCode(replay)).toBe('INVALID_REFRESH_TOKEN');

      // Le jeton légitime issu de la rotation est lui aussi invalidé.
      await http(ctx)
        .post(`${API}/auth/refresh`)
        .send({ refreshToken: refreshed.body.tokens.refreshToken })
        .expect(401);
      const me = await http(ctx)
        .get(`${API}/auth/me`)
        .set('authorization', bearer(refreshed.body.tokens.accessToken))
        .expect(401);
      expect(errorCode(me)).toBe('SESSION_REVOKED');
    });

    it("n'accepte qu'une seule de deux rotations simultanées du même jeton", async () => {
      const owner = await registerOwner(ctx, 'race');
      const results = await Promise.all(
        [1, 2].map(() => http(ctx).post(`${API}/auth/refresh`).send({ refreshToken: owner.refreshToken })),
      );
      expect(results.filter((r) => r.status === 200).length).toBeLessThanOrEqual(1);
      expect(results.some((r) => r.status === 401)).toBe(true);
    });

    it('invalide immédiatement le jeton d’accès à la déconnexion', async () => {
      const owner = await registerOwner(ctx, 'logout');
      await http(ctx).post(`${API}/auth/logout`).set('authorization', bearer(owner)).expect(204);
      await http(ctx).get(`${API}/auth/me`).set('authorization', bearer(owner)).expect(401);
      await http(ctx).post(`${API}/auth/refresh`).send({ refreshToken: owner.refreshToken }).expect(401);
    });
  });

  describe("vérification d'e-mail", () => {
    it('confirme l’adresse avec un jeton à usage unique', async () => {
      const owner = await registerOwner(ctx, 'verify', { verified: false });
      const token = ctx.mailer.tokenFor(owner.email, 'email-verification');

      await http(ctx).post(`${API}/auth/email/verify`).send({ token }).expect(204);
      const me = await http(ctx).get(`${API}/auth/me`).set('authorization', bearer(owner)).expect(200);
      expect(me.body.user.emailVerified).toBe(true);

      const again = await http(ctx).post(`${API}/auth/email/verify`).send({ token }).expect(400);
      expect(errorCode(again)).toBe('INVALID_TOKEN');
    });

    it('un nouvel envoi invalide le jeton précédent', async () => {
      const owner = await registerOwner(ctx, 'resend', { verified: false });
      const first = ctx.mailer.tokenFor(owner.email, 'email-verification');
      await http(ctx).post(`${API}/auth/email/resend`).set('authorization', bearer(owner)).expect(202);
      const second = ctx.mailer.tokenFor(owner.email, 'email-verification');

      expect(second).not.toBe(first);
      await http(ctx).post(`${API}/auth/email/verify`).send({ token: first }).expect(400);
      await http(ctx).post(`${API}/auth/email/verify`).send({ token: second }).expect(204);
    });
  });

  describe('réinitialisation du mot de passe', () => {
    it('répond de la même façon pour un compte inconnu, sans envoyer d’e-mail', async () => {
      const email = uniqueEmail('nobody');
      await http(ctx).post(`${API}/auth/password/forgot`).send({ email }).expect(202);
      expect(ctx.mailer.countFor(email, 'password-reset')).toBe(0);
    });

    it('change le mot de passe, révoque toutes les sessions et consomme le jeton', async () => {
      const owner = await registerOwner(ctx, 'reset');
      const other = await login(ctx, owner.email, owner.password);
      const newPassword = 'Nouveau-Mot-De-Passe-42';

      await http(ctx).post(`${API}/auth/password/forgot`).send({ email: owner.email }).expect(202);
      const token = ctx.mailer.tokenFor(owner.email, 'password-reset');
      await http(ctx).post(`${API}/auth/password/reset`).send({ token, password: newPassword }).expect(204);

      await http(ctx).get(`${API}/auth/me`).set('authorization', bearer(owner)).expect(401);
      await http(ctx).get(`${API}/auth/me`).set('authorization', bearer(other)).expect(401);
      await http(ctx)
        .post(`${API}/auth/login`)
        .send({ email: owner.email, password: owner.password })
        .expect(401);
      await login(ctx, owner.email, newPassword);

      const replay = await http(ctx)
        .post(`${API}/auth/password/reset`)
        .send({ token, password: 'Encore-Un-Autre-Mdp-77' })
        .expect(400);
      expect(errorCode(replay)).toBe('INVALID_TOKEN');
    });

    it('lève le verrouillage du compte', async () => {
      const owner = await registerOwner(ctx, 'unlock');
      for (let attempt = 0; attempt < 5; attempt++) {
        await http(ctx)
          .post(`${API}/auth/login`)
          .send({ email: owner.email, password: 'Mauvais-mot-de-passe-1' })
          .expect(401);
      }
      await http(ctx).post(`${API}/auth/password/forgot`).send({ email: owner.email }).expect(202);
      const token = ctx.mailer.tokenFor(owner.email, 'password-reset');
      await http(ctx)
        .post(`${API}/auth/password/reset`)
        .send({ token, password: 'Nouveau-Mot-De-Passe-42' })
        .expect(204);
      await login(ctx, owner.email, 'Nouveau-Mot-De-Passe-42');
    });
  });
});
