import type { TenantAccess, TenantAuth } from '../src/common/auth-context';
import { MembershipAccessService } from '../src/modules/auth/membership-access.service';
import { MembersService } from '../src/modules/memberships/members.service';
import {
  API,
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
  registerOwner,
  systemRoleId,
  uniqueEmail,
} from './helpers';

type Member = Session & { membershipId: string };

describe('RBAC', () => {
  let ctx: TestContext;
  let owner: Session;
  let admin: Member;
  let member: Member;
  let roles: { owner: string; admin: string; member: string };

  beforeAll(async () => {
    ctx = await createTestContext();
    owner = await registerOwner(ctx, 'rbac');
    roles = {
      owner: await systemRoleId(ctx, owner, 'owner'),
      admin: await systemRoleId(ctx, owner, 'admin'),
      member: await systemRoleId(ctx, owner, 'member'),
    };
    admin = await addMember(ctx, owner, 'rbac-admin', roles.admin);
    member = await addMember(ctx, owner, 'rbac-member', roles.member);
  });
  afterAll(async () => {
    await ctx.close();
  });

  describe('contrôle des permissions par route', () => {
    it('un simple membre lit ce que son rôle autorise', async () => {
      await http(ctx).get(`${API}/members`).set('authorization', bearer(member)).expect(200);
      await http(ctx).get(`${API}/roles`).set('authorization', bearer(member)).expect(200);
      await http(ctx).get(`${API}/organizations/current`).set('authorization', bearer(member)).expect(200);
    });

    it.each([
      ['GET', '/audit-logs', undefined],
      ['POST', '/roles', { name: 'X', permissions: [] }],
      ['PATCH', '/organizations/current', { name: 'Piraté' }],
      ['POST', '/invitations', { email: 'x@test.example', roleId: '00000000-0000-4000-8000-000000000000' }],
      ['PATCH', '/members/00000000-0000-4000-8000-000000000000', { status: 'SUSPENDED' }],
      ['DELETE', '/members/00000000-0000-4000-8000-000000000000', undefined],
      ['DELETE', '/roles/00000000-0000-4000-8000-000000000000', undefined],
    ] as const)('un simple membre est refusé sur %s %s', async (method, path, body) => {
      const agent = http(ctx);
      const pending =
        method === 'GET'
          ? agent.get(`${API}${path}`)
          : method === 'POST'
            ? agent.post(`${API}${path}`)
            : method === 'PATCH'
              ? agent.patch(`${API}${path}`)
              : agent.delete(`${API}${path}`);
      const response = await pending
        .set('authorization', bearer(member))
        .send(body as object | undefined)
        .expect(403);
      expect(errorCode(response)).toBe('PERMISSION_DENIED');
    });

    it('un changement de rôle prend effet immédiatement, sans nouveau jeton', async () => {
      const subject = await addMember(ctx, owner, 'rbac-promoted', roles.member);
      await http(ctx).get(`${API}/audit-logs`).set('authorization', bearer(subject)).expect(403);

      await http(ctx)
        .patch(`${API}/members/${subject.membershipId}`)
        .set('authorization', bearer(owner))
        .send({ roleId: roles.admin })
        .expect(200);
      await http(ctx).get(`${API}/audit-logs`).set('authorization', bearer(subject)).expect(200);

      await http(ctx)
        .patch(`${API}/members/${subject.membershipId}`)
        .set('authorization', bearer(owner))
        .send({ status: 'SUSPENDED' })
        .expect(200);
      const suspended = await http(ctx)
        .get(`${API}/members`)
        .set('authorization', bearer(subject))
        .expect(403);
      expect(errorCode(suspended)).toBe('NO_ACTIVE_ORGANIZATION');
    });
  });

  describe('élévation de privilèges', () => {
    it('un rôle limité ne peut pas créer un rôle plus puissant que lui', async () => {
      const editorRole = await createRole(ctx, owner, 'Éditeur de rôles', ['roles.view', 'roles.manage']);
      const editor = await addMember(ctx, owner, 'rbac-editor', editorRole.id);

      const escalation = await http(ctx)
        .post(`${API}/roles`)
        .set('authorization', bearer(editor))
        .send({ name: 'Porte dérobée', permissions: [{ key: 'audit.view' }, { key: 'members.remove' }] })
        .expect(403);
      expect(errorCode(escalation)).toBe('PRIVILEGE_ESCALATION');
      expect(escalation.body.error.details).toEqual(['audit.view', 'members.remove']);

      // Il ne peut pas non plus s'ajouter des permissions via son propre rôle…
      await http(ctx)
        .patch(`${API}/roles/${editorRole.id}`)
        .set('authorization', bearer(editor))
        .send({ permissions: [{ key: 'roles.view' }, { key: 'roles.manage' }, { key: 'members.update' }] })
        .expect(403);
      // …ni modifier un rôle qui détient plus que lui.
      const strongRole = await createRole(ctx, owner, 'Auditeur', ['audit.view']);
      await http(ctx)
        .patch(`${API}/roles/${strongRole.id}`)
        .set('authorization', bearer(editor))
        .send({ name: 'Auditeur neutralisé', permissions: [] })
        .expect(403);

      // Dans son périmètre, la création fonctionne.
      await http(ctx)
        .post(`${API}/roles`)
        .set('authorization', bearer(editor))
        .send({ name: 'Lecteur de rôles', permissions: [{ key: 'roles.view' }] })
        .expect(201);
    });

    it("un rôle limité ne peut inviter qu'avec un rôle qu'il couvre", async () => {
      const recruiterRole = await createRole(ctx, owner, 'Recruteur', [
        'organization.view',
        'members.view',
        'members.invite',
        'roles.view',
      ]);
      const recruiter = await addMember(ctx, owner, 'rbac-recruiter', recruiterRole.id);

      const escalation = await http(ctx)
        .post(`${API}/invitations`)
        .set('authorization', bearer(recruiter))
        .send({ email: uniqueEmail('wannabe-admin'), roleId: roles.admin })
        .expect(403);
      expect(errorCode(escalation)).toBe('PRIVILEGE_ESCALATION');

      // Un rôle que le recruteur couvre entièrement reste attribuable. On n'utilise
      // pas le rôle système « membre » : depuis la phase 2.1 il porte des permissions
      // de contacts que ce recruteur ne détient pas, donc il n'est plus couvert.
      const juniorRole = await createRole(ctx, owner, 'Collaborateur', ['organization.view', 'members.view']);
      await http(ctx)
        .post(`${API}/invitations`)
        .set('authorization', bearer(recruiter))
        .send({ email: uniqueEmail('new-member'), roleId: juniorRole.id })
        .expect(201);
    });

    it('un administrateur ne peut ni toucher à un propriétaire ni nommer un propriétaire', async () => {
      const ownerMembership = (await listMembers(ctx, owner)).find((m) => m.user.id === owner.userId);

      for (const body of [{ roleId: roles.member }, { status: 'SUSPENDED' }]) {
        const response = await http(ctx)
          .patch(`${API}/members/${ownerMembership?.id}`)
          .set('authorization', bearer(admin))
          .send(body)
          .expect(403);
        expect(errorCode(response)).toBe('OWNER_REQUIRED');
      }
      await http(ctx)
        .delete(`${API}/members/${ownerMembership?.id}`)
        .set('authorization', bearer(admin))
        .expect(403);

      const promote = await http(ctx)
        .patch(`${API}/members/${member.membershipId}`)
        .set('authorization', bearer(admin))
        .send({ roleId: roles.owner })
        .expect(403);
      expect(errorCode(promote)).toBe('OWNER_REQUIRED');
      await http(ctx)
        .post(`${API}/invitations`)
        .set('authorization', bearer(admin))
        .send({ email: uniqueEmail('wannabe-owner'), roleId: roles.owner })
        .expect(403);
    });

    it('personne ne peut modifier ou retirer son propre accès', async () => {
      const self = (await listMembers(ctx, owner)).find((m) => m.user.id === owner.userId);
      const update = await http(ctx)
        .patch(`${API}/members/${self?.id}`)
        .set('authorization', bearer(owner))
        .send({ roleId: roles.member })
        .expect(403);
      expect(errorCode(update)).toBe('CANNOT_MODIFY_SELF');
      await http(ctx).delete(`${API}/members/${self?.id}`).set('authorization', bearer(owner)).expect(403);
    });

    it('garde au moins un propriétaire quand deux propriétaires se rétrogradent en même temps', async () => {
      const solo = await registerOwner(ctx, 'rbac-two-owners');
      const ownerRole = await systemRoleId(ctx, solo, 'owner');
      const memberRole = await systemRoleId(ctx, solo, 'member');
      const second = await addMember(ctx, solo, 'rbac-second-owner', ownerRole);
      const soloMembershipId = (await listMembers(ctx, solo)).find((m) => m.user.id === solo.userId)?.id;

      const results = await Promise.all([
        http(ctx)
          .patch(`${API}/members/${second.membershipId}`)
          .set('authorization', bearer(solo))
          .send({ roleId: memberRole }),
        http(ctx)
          .patch(`${API}/members/${soloMembershipId}`)
          .set('authorization', bearer(second))
          .send({ roleId: memberRole }),
      ]);

      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      const loser = results.find((r) => r.status !== 200);
      // Selon l'ordonnancement, le perdant est arrêté par le garde (il n'est déjà
      // plus propriétaire) ou par l'invariant vérifié sous verrou.
      expect(['LAST_OWNER', 'OWNER_REQUIRED', 'PERMISSION_DENIED']).toContain(
        errorCode(loser as { body: unknown }),
      );

      const { rows } = await ctx.admin.query(
        `SELECT count(*)::int AS n FROM memberships m JOIN roles r ON r.id = m.role_id
         WHERE m.organization_id = $1 AND r.system_key = 'owner' AND m.status = 'ACTIVE'`,
        [solo.organizationId],
      );
      expect(rows[0].n).toBe(1);
    });

    it("l'invariant « dernier propriétaire » tient même si le garde a été franchi avec des droits périmés", async () => {
      // Reproduit de façon déterministe la fenêtre de course : `second` a
      // passé le garde en tant que propriétaire, puis a été rétrogradé avant
      // d'obtenir le verrou. On appelle donc le service avec ses anciens droits.
      const solo = await registerOwner(ctx, 'rbac-last-owner');
      const ownerRole = await systemRoleId(ctx, solo, 'owner');
      const memberRole = await systemRoleId(ctx, solo, 'member');
      const second = await addMember(ctx, solo, 'rbac-stale-owner', ownerRole);
      const members = await listMembers(ctx, solo);
      const soloMembershipId = members.find((m) => m.user.id === solo.userId)?.id as string;

      const staleOwnerRights = (await ctx.app
        .get(MembershipAccessService)
        .load(second.userId, solo.organizationId)) as TenantAccess;
      await http(ctx)
        .patch(`${API}/members/${second.membershipId}`)
        .set('authorization', bearer(solo))
        .send({ roleId: memberRole })
        .expect(200);

      const staleAuth: TenantAuth = {
        userId: second.userId,
        sessionId: 'unused',
        emailVerified: true,
        tenant: staleOwnerRights,
      };
      const service = ctx.app.get(MembersService);
      await expect(service.update(staleAuth, soloMembershipId, { roleId: memberRole })).rejects.toMatchObject(
        {
          code: 'LAST_OWNER',
        },
      );
      await expect(
        service.update(staleAuth, soloMembershipId, { status: 'SUSPENDED' }),
      ).rejects.toMatchObject({
        code: 'LAST_OWNER',
      });
      await expect(service.remove(staleAuth, soloMembershipId)).rejects.toMatchObject({ code: 'LAST_OWNER' });

      // Les transactions refusées ont été annulées : `solo` est toujours propriétaire actif.
      const after = (await listMembers(ctx, solo)).find((m) => m.id === soloMembershipId);
      expect(after).toMatchObject({ status: 'ACTIVE', role: { systemKey: 'owner' } });
    });
  });

  describe('rôles', () => {
    it('les rôles système ne sont ni modifiables ni supprimables', async () => {
      for (const roleId of [roles.owner, roles.admin, roles.member]) {
        const update = await http(ctx)
          .patch(`${API}/roles/${roleId}`)
          .set('authorization', bearer(owner))
          .send({ name: 'Renommé' })
          .expect(403);
        expect(errorCode(update)).toBe('SYSTEM_ROLE_IMMUTABLE');
        await http(ctx).delete(`${API}/roles/${roleId}`).set('authorization', bearer(owner)).expect(403);
      }
    });

    it('valide les permissions demandées', async () => {
      const unknown = await http(ctx)
        .post(`${API}/roles`)
        .set('authorization', bearer(owner))
        // Clé volontairement inexistante au catalogue (ne pas réutiliser une clé réelle).
        .send({ name: 'Inconnu', permissions: [{ key: 'contacts.archive' }] })
        .expect(400);
      expect(errorCode(unknown)).toBe('INVALID_PERMISSIONS');

      const badScope = await http(ctx)
        .post(`${API}/roles`)
        .set('authorization', bearer(owner))
        .send({ name: 'Portée', permissions: [{ key: 'audit.view', scope: 'OWN' }] })
        .expect(400);
      expect(errorCode(badScope)).toBe('INVALID_PERMISSIONS');

      const duplicate = await http(ctx)
        .post(`${API}/roles`)
        .set('authorization', bearer(owner))
        .send({ name: 'Doublon', permissions: [{ key: 'audit.view' }, { key: 'audit.view' }] })
        .expect(400);
      expect(errorCode(duplicate)).toBe('INVALID_PERMISSIONS');
    });

    it('refuse deux rôles du même nom dans une organisation, mais pas entre organisations', async () => {
      await createRole(ctx, owner, 'Nom unique', ['roles.view']);
      const response = await http(ctx)
        .post(`${API}/roles`)
        .set('authorization', bearer(owner))
        .send({ name: 'Nom unique', permissions: [] })
        .expect(409);
      expect(errorCode(response)).toBe('ROLE_NAME_TAKEN');

      const other = await registerOwner(ctx, 'rbac-other-org');
      await createRole(ctx, other, 'Nom unique', ['roles.view']);
    });

    it('met à jour, puis supprime un rôle seulement quand il n’est plus utilisé', async () => {
      const role = await createRole(ctx, owner, 'Temporaire', ['members.view']);
      const holder = await addMember(ctx, owner, 'rbac-holder', role.id);

      const updated = await http(ctx)
        .patch(`${API}/roles/${role.id}`)
        .set('authorization', bearer(owner))
        .send({ name: 'Temporaire v2', permissions: [{ key: 'members.view' }, { key: 'roles.view' }] })
        .expect(200);
      expect(updated.body.permissions.map((p: { key: string }) => p.key)).toEqual([
        'members.view',
        'roles.view',
      ]);
      await http(ctx).get(`${API}/roles`).set('authorization', bearer(holder)).expect(200);

      const inUse = await http(ctx)
        .delete(`${API}/roles/${role.id}`)
        .set('authorization', bearer(owner))
        .expect(409);
      expect(errorCode(inUse)).toBe('ROLE_IN_USE');

      await http(ctx)
        .patch(`${API}/members/${holder.membershipId}`)
        .set('authorization', bearer(owner))
        .send({ roleId: roles.member })
        .expect(200);
      await http(ctx).delete(`${API}/roles/${role.id}`).set('authorization', bearer(owner)).expect(204);
      expect((await listRoles(ctx, owner)).map((r) => r.id)).not.toContain(role.id);
    });
  });

  describe('invitations', () => {
    it('exige une adresse e-mail vérifiée pour inviter', async () => {
      const unverified = await registerOwner(ctx, 'rbac-unverified', { verified: false });
      const response = await http(ctx)
        .post(`${API}/invitations`)
        .set('authorization', bearer(unverified))
        .send({ email: uniqueEmail('guest'), roleId: await systemRoleId(ctx, unverified, 'member') })
        .expect(403);
      expect(errorCode(response)).toBe('EMAIL_NOT_VERIFIED');
    });

    it('refuse une invitation en double et une personne déjà membre', async () => {
      const email = uniqueEmail('twice');
      await invite(ctx, owner, email, roles.member);
      const duplicate = await http(ctx)
        .post(`${API}/invitations`)
        .set('authorization', bearer(owner))
        .send({ email: email.toUpperCase(), roleId: roles.member })
        .expect(409);
      expect(errorCode(duplicate)).toBe('INVITATION_ALREADY_PENDING');

      const already = await http(ctx)
        .post(`${API}/invitations`)
        .set('authorization', bearer(owner))
        .send({ email: member.email, roleId: roles.member })
        .expect(409);
      expect(errorCode(already)).toBe('ALREADY_MEMBER');
    });

    it("ne renvoie jamais le jeton d'invitation par l'API", async () => {
      const email = uniqueEmail('secret');
      const response = await http(ctx)
        .post(`${API}/invitations`)
        .set('authorization', bearer(owner))
        .send({ email, roleId: roles.member })
        .expect(201);
      const token = ctx.mailer.tokenFor(email, 'organization-invitation');
      const list = await http(ctx).get(`${API}/invitations`).set('authorization', bearer(owner)).expect(200);
      const audit = await http(ctx)
        .get(`${API}/audit-logs?limit=100`)
        .set('authorization', bearer(owner))
        .expect(200);
      for (const body of [response.body, list.body, audit.body]) {
        expect(JSON.stringify(body)).not.toContain(token);
        expect(JSON.stringify(body)).not.toContain('tokenHash');
      }
    });

    it("n'est utilisable qu'une fois, et pas après révocation", async () => {
      const used = await invite(ctx, owner, uniqueEmail('once'), roles.member);
      const signup = { name: 'Invité', password: 'Correct-Horse-Battery-9' };
      await http(ctx)
        .post(`${API}/invitations/accept-signup`)
        .send({ token: used.token, ...signup })
        .expect(201);
      const replay = await http(ctx)
        .post(`${API}/invitations/accept-signup`)
        .send({ token: used.token, ...signup })
        .expect(400);
      expect(errorCode(replay)).toBe('INVALID_INVITATION');

      const revoked = await invite(ctx, owner, uniqueEmail('revoked'), roles.member);
      await http(ctx)
        .delete(`${API}/invitations/${revoked.invitationId}`)
        .set('authorization', bearer(owner))
        .expect(204);
      await http(ctx)
        .post(`${API}/invitations/accept-signup`)
        .send({ token: revoked.token, ...signup })
        .expect(400);
    });

    it("ne peut être acceptée que par le compte de l'adresse invitée", async () => {
      const stranger = await registerOwner(ctx, 'rbac-stranger');
      const { token } = await invite(ctx, owner, uniqueEmail('intended'), roles.admin);

      const response = await http(ctx)
        .post(`${API}/invitations/accept`)
        .set('authorization', bearer(stranger))
        .send({ token })
        .expect(403);
      expect(errorCode(response)).toBe('INVITATION_EMAIL_MISMATCH');
      expect((await listMembers(ctx, owner)).map((m) => m.user.id)).not.toContain(stranger.userId);
    });

    it("demande de se connecter quand un compte existe déjà pour l'adresse invitée", async () => {
      const existing = await registerOwner(ctx, 'rbac-existing');
      const { token } = await invite(ctx, owner, existing.email, roles.member);
      const response = await http(ctx)
        .post(`${API}/invitations/accept-signup`)
        .send({ token, name: 'Usurpateur', password: 'Correct-Horse-Battery-9' })
        .expect(409);
      expect(errorCode(response)).toBe('ACCOUNT_EXISTS');

      // L'invitation reste valable pour le vrai titulaire du compte.
      await http(ctx)
        .post(`${API}/invitations/accept`)
        .set('authorization', bearer(existing))
        .send({ token })
        .expect(200);
    });
  });

  describe('audit', () => {
    it('trace les actions sensibles avec leur auteur', async () => {
      const response = await http(ctx)
        .get(`${API}/audit-logs?limit=100`)
        .set('authorization', bearer(owner))
        .expect(200);
      const actions = new Set(response.body.items.map((e: { action: string }) => e.action));
      for (const action of [
        'organization.created',
        'invitation.created',
        'invitation.accepted',
        'role.created',
        'role.deleted',
        'member.updated',
      ]) {
        expect(actions).toContain(action);
      }
      const filtered = await http(ctx)
        .get(`${API}/audit-logs?action=role.deleted`)
        .set('authorization', bearer(owner))
        .expect(200);
      expect(filtered.body.items.length).toBeGreaterThan(0);
      expect(filtered.body.items.every((e: { action: string }) => e.action === 'role.deleted')).toBe(true);
      expect(filtered.body.items[0].actorUserId).toBe(owner.userId);
    });

    it('pagine par curseur sans doublon ni trou', async () => {
      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const url: string = `${API}/audit-logs?limit=5${cursor ? `&cursor=${cursor}` : ''}`;
        const page = await http(ctx).get(url).set('authorization', bearer(owner)).expect(200);
        seen.push(...page.body.items.map((e: { id: string }) => e.id));
        cursor = page.body.nextCursor;
      } while (cursor);

      const all = await ctx.admin.query(
        'SELECT count(*)::int AS n FROM audit_logs WHERE organization_id = $1',
        [owner.organizationId],
      );
      expect(new Set(seen).size).toBe(seen.length);
      expect(seen.length).toBe(all.rows[0].n);
    });
  });
});
