// La limite est lue dans la configuration au démarrage : on la fixe AVANT de
// charger l'application (chaque fichier de test a son propre registre de modules).
process.env.AUTH_RATE_LIMIT_MAX = '3';

import { API, type TestContext, createTestContext, errorCode, http, uniqueEmail } from './helpers';

describe('Limitation de débit des routes sensibles', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('bloque les tentatives de connexion au-delà de la limite, puis répond 429', async () => {
    const attempt = () =>
      http(ctx)
        .post(`${API}/auth/login`)
        .send({ email: uniqueEmail('bruteforce'), password: 'Mot-de-passe-devine-1' });

    for (let i = 0; i < 3; i++) {
      expect((await attempt()).status).toBe(401);
    }
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(errorCode(blocked)).toBe('RATE_LIMITED');
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it("n'applique pas la limite renforcée aux routes ordinaires", async () => {
    for (let i = 0; i < 6; i++) {
      await http(ctx).get(`${API}/health/live`).expect(200);
    }
  });
});
