import { PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';
import { ACCESS_POLICY, type AccessPolicy } from '../src/common/auth-context';
import { PERMISSION_KEYS } from '../src/modules/permissions/permission-catalog';
import { API, type TestContext, createTestContext, errorCode, http } from './helpers';

interface RouteInfo {
  name: string;
  policy: AccessPolicy | undefined;
}

/** Critère de sortie du cahier des charges : « aucun endpoint métier sans contrôle d'accès ». */
describe("Politique d'accès des routes", () => {
  let ctx: TestContext;
  let routes: RouteInfo[];

  beforeAll(async () => {
    ctx = await createTestContext();
    const discovery = ctx.app.get(DiscoveryService);
    const scanner = new MetadataScanner();

    routes = discovery.getControllers().flatMap((wrapper) => {
      const instance = wrapper.instance as object;
      const prototype = Object.getPrototypeOf(instance) as object;
      return scanner
        .getAllMethodNames(prototype)
        .map((method) => ({ method, handler: (prototype as Record<string, unknown>)[method] as object }))
        .filter(({ handler }) => Reflect.getMetadata(PATH_METADATA, handler) !== undefined)
        .map(({ method, handler }) => ({
          name: `${instance.constructor.name}.${method}`,
          policy: (Reflect.getMetadata(ACCESS_POLICY, handler) ??
            Reflect.getMetadata(ACCESS_POLICY, instance.constructor)) as AccessPolicy | undefined,
        }));
    });
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('chaque route déclare explicitement sa politique', () => {
    expect(routes.length).toBeGreaterThan(20);
    expect(routes.filter((r) => !r.policy).map((r) => r.name)).toEqual([]);
  });

  it('les routes publiques sont exactement celles attendues', () => {
    const publicRoutes = routes.filter((r) => r.policy?.kind === 'public').map((r) => r.name);
    expect(publicRoutes.sort()).toEqual(
      [
        'AuthController.register',
        'AuthController.login',
        'AuthController.refresh',
        'AuthController.verifyEmail',
        'AuthController.forgotPassword',
        'AuthController.resetPassword',
        'InvitationsController.acceptWithSignup',
        'HealthController.live',
        'HealthController.ready',
      ].sort(),
    );
  });

  it('les routes hors organisation sont exactement celles attendues', () => {
    const userRoutes = routes.filter((r) => r.policy?.kind === 'user').map((r) => r.name);
    expect(userRoutes.sort()).toEqual(
      [
        'AuthController.logout',
        'AuthController.me',
        'AuthController.switchOrganization',
        'AuthController.resendVerification',
        'OrganizationsController.listMine',
        'OrganizationsController.create',
        'InvitationsController.accept',
      ].sort(),
    );
  });

  it('les routes métier exigent des permissions existant au catalogue', () => {
    const known = new Set<string>(PERMISSION_KEYS);
    const used = new Set<string>();
    for (const route of routes) {
      if (route.policy?.kind !== 'permissions') continue;
      expect(route.policy.permissions.length).toBeGreaterThan(0);
      for (const key of route.policy.permissions) {
        expect(known.has(key)).toBe(true);
        used.add(key);
      }
    }
    // Aucune permission « morte » : toutes celles du catalogue protègent au moins une route.
    expect([...known].filter((key) => !used.has(key))).toEqual([]);
  });

  it('toute route métier refuse une requête anonyme', async () => {
    for (const path of [
      '/members',
      '/roles',
      '/permissions',
      '/invitations',
      '/audit-logs',
      '/organizations/current',
      '/organizations',
    ]) {
      const response = await http(ctx).get(`${API}${path}`).expect(401);
      expect(errorCode(response)).toBe('UNAUTHENTICATED');
    }
  });

  describe('socle HTTP', () => {
    it('expose les sondes de santé sans authentification', async () => {
      await http(ctx).get(`${API}/health/live`).expect(200, { status: 'ok' });
      const ready = await http(ctx).get(`${API}/health/ready`).expect(200);
      expect(ready.body.checks.database).toBe('ok');
    });

    it('normalise les erreurs et propage un identifiant de corrélation', async () => {
      const response = await http(ctx)
        .get(`${API}/route-inexistante`)
        .set('x-request-id', 'test-correlation-1234')
        .expect(404);
      expect(response.body).toEqual({
        error: { code: 'NOT_FOUND', message: expect.any(String), requestId: 'test-correlation-1234' },
      });
      expect(response.headers['x-request-id']).toBe('test-correlation-1234');
    });

    it("génère l'identifiant de corrélation et ignore une valeur suspecte", async () => {
      const response = await http(ctx).get(`${API}/health/live`).set('x-request-id', '<script>').expect(200);
      expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('pose les en-têtes de sécurité et ne révèle pas la pile technique', async () => {
      const response = await http(ctx).get(`${API}/health/live`).expect(200);
      expect(response.headers['x-powered-by']).toBeUndefined();
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['strict-transport-security']).toBeDefined();
    });

    it("n'accorde CORS qu'aux origines configurées", async () => {
      const response = await http(ctx)
        .get(`${API}/health/live`)
        .set('origin', 'https://site-malveillant.example')
        .expect(200);
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('rejette un identifiant mal formé avant tout accès à la base', async () => {
      const response = await http(ctx).post(`${API}/auth/switch-organization`).send({ organizationId: 'x' });
      expect(response.status).toBe(401);
    });
  });
});
