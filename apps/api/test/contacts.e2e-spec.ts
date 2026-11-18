import {
  API,
  type Session,
  addMember,
  bearer,
  createRole,
  errorCode,
  http,
  registerOwner,
  systemRoleId,
  type TestContext,
  createTestContext,
} from './helpers';

/**
 * Module contacts / entreprises / étiquettes.
 *
 * Ce qui est vérifié ici et ne l'est nulle part ailleurs :
 *  - les portées RBAC (OWN vs ORGANIZATION) changent réellement les lignes visibles ;
 *  - l'accès croisé entre deux tenants est impossible, y compris par identifiant ;
 *  - les FK composites refusent de rattacher une entreprise ou une étiquette
 *    appartenant à une autre organisation.
 */
describe('Contacts, entreprises et étiquettes', () => {
  let ctx: TestContext;
  let owner: Session;
  let other: Session;

  beforeAll(async () => {
    ctx = await createTestContext();
    owner = await registerOwner(ctx, 'crm-owner');
    other = await registerOwner(ctx, 'crm-other');
  });

  afterAll(async () => {
    await ctx.close();
  });

  const auth = (session: Session) => ({ authorization: bearer(session) });

  const createContact = (session: Session, body: Record<string, unknown>) =>
    http(ctx).post(`${API}/contacts`).set(auth(session)).send(body);

  const createCompany = (session: Session, body: Record<string, unknown>) =>
    http(ctx).post(`${API}/companies`).set(auth(session)).send(body);

  const createTag = (session: Session, body: Record<string, unknown>) =>
    http(ctx).post(`${API}/tags`).set(auth(session)).send(body);

  describe('CRUD contact', () => {
    it('crée un contact, le relit et le retrouve par recherche', async () => {
      const created = await createContact(owner, {
        firstName: 'Grâce',
        lastName: 'Houngbo',
        email: 'Grace.Houngbo@Exemple.COM',
        phone: '+229 97 00 00 00',
        status: 'PROSPECT',
        source: 'Salon',
      }).expect(201);

      expect(created.body).toMatchObject({
        firstName: 'Grâce',
        lastName: 'Houngbo',
        // L'e-mail est normalisé en minuscules (contrainte CHECK en base).
        email: 'grace.houngbo@exemple.com',
        status: 'PROSPECT',
        tags: [],
      });
      // Le propriétaire par défaut est le créateur.
      expect(created.body.ownerMembershipId).toEqual(expect.any(String));

      const read = await http(ctx).get(`${API}/contacts/${created.body.id}`).set(auth(owner)).expect(200);
      expect(read.body.id).toBe(created.body.id);

      const search = await http(ctx).get(`${API}/contacts?q=houngbo`).set(auth(owner)).expect(200);
      expect(search.body.items.map((c: { id: string }) => c.id)).toContain(created.body.id);

      const byStatus = await http(ctx).get(`${API}/contacts?status=PROSPECT`).set(auth(owner)).expect(200);
      expect(byStatus.body.items.map((c: { id: string }) => c.id)).toContain(created.body.id);
    });

    it('refuse un contact sans nom ni prénom', async () => {
      const response = await createContact(owner, { email: 'sans-nom@exemple.com' }).expect(400);
      expect(errorCode(response)).toBe('NAME_REQUIRED');
    });

    it('refuse un e-mail invalide', async () => {
      const response = await createContact(owner, { lastName: 'Test', email: 'pas-un-email' }).expect(400);
      expect(errorCode(response)).toBe('VALIDATION_ERROR');
    });

    it('met à jour, efface un champ avec null et conserve les autres', async () => {
      const created = await createContact(owner, {
        firstName: 'Léa',
        lastName: 'Dossou',
        phone: '+229 90 00 00 00',
      }).expect(201);

      const updated = await http(ctx)
        .patch(`${API}/contacts/${created.body.id}`)
        .set(auth(owner))
        .send({ status: 'CUSTOMER', phone: null })
        .expect(200);

      expect(updated.body.status).toBe('CUSTOMER');
      expect(updated.body.phone).toBeNull();
      // Non transmis => inchangé.
      expect(updated.body.firstName).toBe('Léa');
    });

    it('refuse un corps sans aucune modification', async () => {
      const created = await createContact(owner, { lastName: 'Vide' }).expect(201);
      const response = await http(ctx)
        .patch(`${API}/contacts/${created.body.id}`)
        .set(auth(owner))
        .send({})
        .expect(400);
      expect(errorCode(response)).toBe('NO_CHANGES');
    });

    it('supprime logiquement : la fiche sort des listes mais reste en base', async () => {
      const created = await createContact(owner, { lastName: 'Supprimable' }).expect(201);
      await http(ctx).delete(`${API}/contacts/${created.body.id}`).set(auth(owner)).expect(204);

      await http(ctx).get(`${API}/contacts/${created.body.id}`).set(auth(owner)).expect(404);

      const list = await http(ctx).get(`${API}/contacts?q=Supprimable`).set(auth(owner)).expect(200);
      expect(list.body.items).toEqual([]);

      const { rows } = await ctx.admin.query('SELECT deleted_at FROM contacts WHERE id = $1', [
        created.body.id,
      ]);
      expect(rows[0].deleted_at).not.toBeNull();
    });

    it('pagine par curseur', async () => {
      const session = await registerOwner(ctx, 'crm-page');
      for (const name of ['Un', 'Deux', 'Trois']) {
        await createContact(session, { lastName: `Pagination${name}` }).expect(201);
      }
      const first = await http(ctx).get(`${API}/contacts?limit=2`).set(auth(session)).expect(200);
      expect(first.body.items).toHaveLength(2);
      expect(first.body.nextCursor).toEqual(expect.any(String));

      const second = await http(ctx)
        .get(`${API}/contacts?limit=2&cursor=${first.body.nextCursor}`)
        .set(auth(session))
        .expect(200);
      expect(second.body.items).toHaveLength(1);
      expect(second.body.nextCursor).toBeNull();
    });
  });

  describe('Entreprises et étiquettes', () => {
    it('rattache un contact à une entreprise et compte les contacts actifs', async () => {
      const company = await createCompany(owner, {
        name: 'Times Trading Inter',
        domain: 'timestradinginter.com',
        country: 'BJ',
      }).expect(201);
      expect(company.body.contactCount).toBe(0);

      await createContact(owner, { lastName: 'Salarié', companyId: company.body.id }).expect(201);

      const reloaded = await http(ctx)
        .get(`${API}/companies/${company.body.id}`)
        .set(auth(owner))
        .expect(200);
      expect(reloaded.body.contactCount).toBe(1);
    });

    it('refuse de supprimer une entreprise qui porte encore des contacts actifs', async () => {
      const company = await createCompany(owner, { name: 'Occupée SARL' }).expect(201);
      await createContact(owner, { lastName: 'Occupant', companyId: company.body.id }).expect(201);

      const response = await http(ctx)
        .delete(`${API}/companies/${company.body.id}`)
        .set(auth(owner))
        .expect(409);
      expect(errorCode(response)).toBe('COMPANY_IN_USE');
    });

    it("refuse de rattacher le contact à l'entreprise d'une autre organisation", async () => {
      const foreign = await createCompany(other, { name: 'Autre Organisation' }).expect(201);
      const response = await createContact(owner, {
        lastName: 'Intrus',
        companyId: foreign.body.id,
      }).expect(400);
      expect(errorCode(response)).toBe('INVALID_COMPANY');
    });

    it('applique des étiquettes et refuse celles d’une autre organisation', async () => {
      const tag = await createTag(owner, { name: 'Grand compte', color: '#2563EB' }).expect(201);
      expect(tag.body.color).toBe('#2563eb');

      const contact = await createContact(owner, {
        lastName: 'Étiqueté',
        tagIds: [tag.body.id],
      }).expect(201);
      expect(contact.body.tags).toEqual([{ id: tag.body.id, name: 'Grand compte', color: '#2563eb' }]);

      const filtered = await http(ctx)
        .get(`${API}/contacts?tagId=${tag.body.id}`)
        .set(auth(owner))
        .expect(200);
      expect(filtered.body.items.map((c: { id: string }) => c.id)).toContain(contact.body.id);

      const foreignTag = await createTag(other, { name: 'Grand compte' }).expect(201);
      const response = await createContact(owner, {
        lastName: 'Mélange',
        tagIds: [foreignTag.body.id],
      }).expect(400);
      expect(errorCode(response)).toBe('INVALID_TAG');
    });

    it('refuse deux étiquettes de même nom à la casse près', async () => {
      await createTag(owner, { name: 'Fidèle' }).expect(201);
      const response = await createTag(owner, { name: 'fidèle' }).expect(409);
      expect(errorCode(response)).toBe('TAG_NAME_TAKEN');
    });
  });

  describe('Cloisonnement entre organisations', () => {
    it("un contact d'une organisation est introuvable depuis l'autre, même avec son identifiant", async () => {
      const created = await createContact(owner, { lastName: 'Confidentiel' }).expect(201);

      await http(ctx).get(`${API}/contacts/${created.body.id}`).set(auth(other)).expect(404);
      await http(ctx)
        .patch(`${API}/contacts/${created.body.id}`)
        .set(auth(other))
        .send({ status: 'CUSTOMER' })
        .expect(404);
      await http(ctx).delete(`${API}/contacts/${created.body.id}`).set(auth(other)).expect(404);

      const list = await http(ctx).get(`${API}/contacts?q=Confidentiel`).set(auth(other)).expect(200);
      expect(list.body.items).toEqual([]);
    });
  });

  describe('Permissions et portées', () => {
    it('un membre sans contacts.delete ne peut pas supprimer', async () => {
      const org = await registerOwner(ctx, 'crm-perm');
      const memberRoleId = await systemRoleId(ctx, org, 'member');
      const member = await addMember(ctx, org, 'perm-member', memberRoleId);

      const created = await createContact(org, { lastName: 'Protégé' }).expect(201);
      // Le rôle « membre » peut créer et modifier…
      await http(ctx)
        .patch(`${API}/contacts/${created.body.id}`)
        .set(auth(member))
        .send({ status: 'PROSPECT' })
        .expect(200);
      // …mais pas supprimer.
      const response = await http(ctx)
        .delete(`${API}/contacts/${created.body.id}`)
        .set(auth(member))
        .expect(403);
      expect(errorCode(response)).toBe('PERMISSION_DENIED');
    });

    it('une portée OWN ne montre que ses propres fiches, une portée ORGANIZATION montre tout', async () => {
      const org = await registerOwner(ctx, 'crm-scope');
      const memberRoleId = await systemRoleId(ctx, org, 'member');
      const narrow = await addMember(ctx, org, 'scope-own', memberRoleId);
      void narrow;

      // Rôle personnalisé limité à la portée OWN sur la consultation et la modification.
      const scoped = await createRole(ctx, org, 'Commercial (portefeuille)', [
        'contacts.view',
        'contacts.create',
        'contacts.update',
      ]);
      const scopedBody = await http(ctx)
        .patch(`${API}/roles/${scoped.id}`)
        .set(auth(org))
        .send({
          permissions: [
            { key: 'contacts.view', scope: 'OWN' },
            { key: 'contacts.create', scope: 'OWN' },
            { key: 'contacts.update', scope: 'OWN' },
          ],
        })
        .expect(200);
      expect(scopedBody.body.permissions).toEqual(
        expect.arrayContaining([{ key: 'contacts.view', scope: 'OWN' }]),
      );

      const rep = await addMember(ctx, org, 'scope-rep', scoped.id);

      const mine = await createContact(rep, { lastName: 'PortefeuilleRep' }).expect(201);
      const ownersContact = await createContact(org, { lastName: 'PortefeuillePatron' }).expect(201);

      // Le commercial ne voit que sa fiche.
      const repList = await http(ctx).get(`${API}/contacts`).set(auth(rep)).expect(200);
      const repIds = repList.body.items.map((c: { id: string }) => c.id);
      expect(repIds).toContain(mine.body.id);
      expect(repIds).not.toContain(ownersContact.body.id);

      // Il ne peut pas modifier la fiche d'un autre.
      const denied = await http(ctx)
        .patch(`${API}/contacts/${ownersContact.body.id}`)
        .set(auth(rep))
        .send({ status: 'CUSTOMER' })
        .expect(403);
      expect(errorCode(denied)).toBe('OUT_OF_SCOPE');

      // Le propriétaire de l'organisation voit tout.
      const ownerList = await http(ctx).get(`${API}/contacts`).set(auth(org)).expect(200);
      const ownerIds = ownerList.body.items.map((c: { id: string }) => c.id);
      expect(ownerIds).toEqual(expect.arrayContaining([mine.body.id, ownersContact.body.id]));

      void narrow;
    });
  });
});
