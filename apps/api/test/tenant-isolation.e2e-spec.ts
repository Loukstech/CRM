import { SessionService } from '../src/modules/auth/session.service';
import {
  API,
  type RoleView,
  type Session,
  type TestContext,
  addMember,
  bearer,
  createRole,
  createTestContext,
  errorCode,
  http,
  invite,
  listMembers,
  listRoles,
  login,
  registerOwner,
  systemRoleId,
  uniqueEmail,
} from './helpers';

/**
 * Critère de sortie du cahier des charges : « aucune fuite de données entre
 * organisations ». Ces tests attaquent l'API avec un compte légitime de
 * l'organisation A et tentent de lire ou modifier les données de B.
 */
describe('Isolation multi-tenant (API)', () => {
  let ctx: TestContext;
  let ownerA: Session;
  let ownerB: Session;
  let memberA: Session & { membershipId: string };
  let memberB: Session & { membershipId: string };
  let roleB: RoleView;
  let memberRoleA: string;
  let invitationB: { invitationId: string; token: string };

  beforeAll(async () => {
    ctx = await createTestContext();
    ownerA = await registerOwner(ctx, 'iso-a');
    ownerB = await registerOwner(ctx, 'iso-b');
    memberRoleA = await systemRoleId(ctx, ownerA, 'member');
    const memberRoleB = await systemRoleId(ctx, ownerB, 'member');
    memberA = await addMember(ctx, ownerA, 'iso-a-member', memberRoleA);
    memberB = await addMember(ctx, ownerB, 'iso-b-member', memberRoleB);
    roleB = await createRole(ctx, ownerB, 'Rôle confidentiel B', ['members.view']);
    invitationB = await invite(ctx, ownerB, uniqueEmail('iso-b-pending'), memberRoleB);
  });
  afterAll(async () => {
    await ctx.close();
  });

  const asA = () => bearer(ownerA);

  describe('lecture', () => {
    it('ne liste que les membres de son organisation', async () => {
      const members = await listMembers(ctx, ownerA);
      const userIds = members.map((m) => m.user.id).sort();
      expect(userIds).toEqual([ownerA.userId, memberA.userId].sort());
      expect(JSON.stringify(members)).not.toContain(ownerB.email);
    });

    it('ne liste que les rôles de son organisation', async () => {
      const rolesA = await listRoles(ctx, ownerA);
      const rolesB = await listRoles(ctx, ownerB);
      const idsB = new Set(rolesB.map((r) => r.id));
      expect(rolesA.some((r) => idsB.has(r.id))).toBe(false);
      expect(rolesA.map((r) => r.name)).not.toContain('Rôle confidentiel B');
    });

    it('ne liste que les invitations de son organisation', async () => {
      const response = await http(ctx).get(`${API}/invitations`).set('authorization', asA()).expect(200);
      expect(response.body.map((i: { id: string }) => i.id)).not.toContain(invitationB.invitationId);
    });

    it("ne montre que le journal d'audit de son organisation", async () => {
      const response = await http(ctx)
        .get(`${API}/audit-logs?limit=100`)
        .set('authorization', asA())
        .expect(200);
      const serialized = JSON.stringify(response.body);
      expect(response.body.items.length).toBeGreaterThan(0);
      expect(serialized).not.toContain(ownerB.organizationId);
      expect(serialized).not.toContain(ownerB.userId);
      expect(serialized).not.toContain(roleB.id);
    });

    it("retourne son organisation, jamais celle d'un autre", async () => {
      const response = await http(ctx)
        .get(`${API}/organizations/current`)
        .set('authorization', asA())
        .expect(200);
      expect(response.body.id).toBe(ownerA.organizationId);

      const mine = await http(ctx).get(`${API}/organizations`).set('authorization', asA()).expect(200);
      expect(mine.body.map((o: { id: string }) => o.id)).toEqual([ownerA.organizationId]);
    });

    it("n'accepte pas un curseur de pagination pointant vers un autre tenant", async () => {
      const response = await http(ctx)
        .get(`${API}/members?cursor=${memberB.membershipId}`)
        .set('authorization', asA())
        .expect(200);
      expect(JSON.stringify(response.body)).not.toContain(memberB.userId);
      expect(JSON.stringify(response.body)).not.toContain(ownerB.userId);
    });
  });

  describe('écriture', () => {
    it("ne peut ni modifier ni retirer un membre d'une autre organisation (404)", async () => {
      await http(ctx)
        .patch(`${API}/members/${memberB.membershipId}`)
        .set('authorization', asA())
        .send({ status: 'SUSPENDED' })
        .expect(404);
      await http(ctx)
        .delete(`${API}/members/${memberB.membershipId}`)
        .set('authorization', asA())
        .expect(404);

      const stillThere = (await listMembers(ctx, ownerB)).find((m) => m.id === memberB.membershipId);
      expect(stillThere?.status).toBe('ACTIVE');
    });

    it("ne peut ni modifier ni supprimer un rôle d'une autre organisation (404)", async () => {
      await http(ctx)
        .patch(`${API}/roles/${roleB.id}`)
        .set('authorization', asA())
        .send({ name: 'Piraté', permissions: [] })
        .expect(404);
      await http(ctx).delete(`${API}/roles/${roleB.id}`).set('authorization', asA()).expect(404);

      const role = (await listRoles(ctx, ownerB)).find((r) => r.id === roleB.id);
      expect(role).toMatchObject({ name: 'Rôle confidentiel B' });
      expect(role?.permissions).toHaveLength(1);
    });

    it("ne peut pas attribuer à ses membres le rôle d'une autre organisation", async () => {
      await http(ctx)
        .patch(`${API}/members/${memberA.membershipId}`)
        .set('authorization', asA())
        .send({ roleId: roleB.id })
        .expect(404);
      await http(ctx)
        .post(`${API}/invitations`)
        .set('authorization', asA())
        .send({ email: uniqueEmail('cross-role'), roleId: roleB.id })
        .expect(404);
    });

    it("ne peut pas révoquer l'invitation d'une autre organisation", async () => {
      await http(ctx)
        .delete(`${API}/invitations/${invitationB.invitationId}`)
        .set('authorization', asA())
        .expect(404);
      const pending = await http(ctx)
        .get(`${API}/invitations`)
        .set('authorization', bearer(ownerB))
        .expect(200);
      expect(pending.body.map((i: { id: string }) => i.id)).toContain(invitationB.invitationId);
    });
  });

  describe("contexte d'organisation", () => {
    it("refuse de basculer vers une organisation dont on n'est pas membre, sans révéler son existence", async () => {
      const existing = await http(ctx)
        .post(`${API}/auth/switch-organization`)
        .set('authorization', asA())
        .send({ organizationId: ownerB.organizationId })
        .expect(403);
      const unknown = await http(ctx)
        .post(`${API}/auth/switch-organization`)
        .set('authorization', asA())
        .send({ organizationId: '00000000-0000-4000-8000-000000000000' })
        .expect(403);
      expect(errorCode(existing)).toBe('NOT_A_MEMBER');
      expect(existing.body.error.message).toBe(unknown.body.error.message);
    });

    it('ignore une organisation étrangère demandée à la connexion', async () => {
      const session = await login(ctx, ownerA.email, ownerA.password, ownerB.organizationId);
      expect(session.organizationId).toBe(ownerA.organizationId);
    });

    it("revalide en base l'organisation portée par le jeton : un jeton valide visant B ne donne aucun accès", async () => {
      // Jeton authentique (bonne signature, bonne session) mais dont la
      // revendication `org` désigne une organisation étrangère : simule un
      // jeton obsolète ou un défaut d'émission.
      const session = await login(ctx, ownerA.email, ownerA.password);
      const me = await http(ctx).get(`${API}/auth/me`).set('authorization', bearer(session)).expect(200);
      const payload = JSON.parse(
        Buffer.from(session.accessToken.split('.')[1] as string, 'base64url').toString(),
      ) as { sid: string };
      const crafted = await ctx.app.get(SessionService).signAccessToken({
        sub: me.body.user.id,
        sid: payload.sid,
        org: ownerB.organizationId,
      });

      for (const path of ['/members', '/roles', '/invitations', '/audit-logs', '/organizations/current']) {
        const response = await http(ctx)
          .get(`${API}${path}`)
          .set('authorization', bearer(crafted))
          .expect(403);
        expect(errorCode(response)).toBe('NO_ACTIVE_ORGANIZATION');
      }
    });
  });

  describe('utilisateur membre de deux organisations', () => {
    it('ne voit que les données de son organisation active et bascule proprement', async () => {
      // memberA est invité dans B avec son compte existant.
      const { token } = await invite(ctx, ownerB, memberA.email, await systemRoleId(ctx, ownerB, 'member'));
      await http(ctx)
        .post(`${API}/invitations/accept`)
        .set('authorization', bearer(memberA))
        .send({ token })
        .expect(200);

      const inA = await listMembers(ctx, memberA);
      expect(inA.map((m) => m.user.id)).not.toContain(ownerB.userId);

      const switched = await http(ctx)
        .post(`${API}/auth/switch-organization`)
        .set('authorization', bearer(memberA))
        .send({ organizationId: ownerB.organizationId })
        .expect(200);
      const inB = await listMembers(ctx, { ...memberA, accessToken: switched.body.accessToken });
      expect(inB.map((m) => m.user.id)).toContain(ownerB.userId);
      expect(inB.map((m) => m.user.id)).not.toContain(ownerA.userId);

      // L'ancien jeton reste cantonné à A.
      const stillA = await http(ctx)
        .get(`${API}/organizations/current`)
        .set('authorization', bearer(memberA))
        .expect(200);
      expect(stillA.body.id).toBe(ownerA.organizationId);
    });
  });

  describe("perte d'accès immédiate", () => {
    it("un membre retiré perd l'accès sans attendre l'expiration de son jeton", async () => {
      const leaver = await addMember(ctx, ownerA, 'iso-leaver', memberRoleA);
      await http(ctx).get(`${API}/members`).set('authorization', bearer(leaver)).expect(200);

      await http(ctx).delete(`${API}/members/${leaver.membershipId}`).set('authorization', asA()).expect(204);

      const response = await http(ctx).get(`${API}/members`).set('authorization', bearer(leaver)).expect(403);
      expect(errorCode(response)).toBe('NO_ACTIVE_ORGANIZATION');
      const refreshed = await http(ctx)
        .post(`${API}/auth/refresh`)
        .send({ refreshToken: leaver.refreshToken })
        .expect(200);
      expect(refreshed.body.activeOrganizationId).toBeNull();
    });

    it("une organisation suspendue n'est plus accessible à ses membres", async () => {
      const owner = await registerOwner(ctx, 'iso-suspended');
      await ctx.admin.query(`UPDATE organizations SET status = 'SUSPENDED' WHERE id = $1`, [
        owner.organizationId,
      ]);
      const response = await http(ctx)
        .get(`${API}/organizations/current`)
        .set('authorization', bearer(owner))
        .expect(403);
      expect(errorCode(response)).toBe('NO_ACTIVE_ORGANIZATION');
    });
  });
});
