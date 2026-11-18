import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { type TenantAuth, dbScopeOf } from '../../common/auth-context';
import { AppError } from '../../common/errors';
import { cursorArgs, toPage } from '../../common/pagination';
import { TenantDb, type Tx } from '../../database/tenant-db.service';
import { AuditService } from '../audit/audit.service';
import { assertCompanyExists } from './companies.service';
import { assertInScope, dataScopeOf, ownerScopeFilter, resolveOwnerId } from './data-scope';
import type { ContactQuery, CreateContactDto, UpdateContactDto } from './dto/crm.dto';

const CONTACT_VIEW = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  jobTitle: true,
  companyId: true,
  status: true,
  source: true,
  notes: true,
  ownerMembershipId: true,
  createdAt: true,
  updatedAt: true,
  company: { select: { id: true, name: true } },
  owner: { select: { id: true, user: { select: { id: true, name: true, email: true } } } },
  tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
} as const;

type ContactRow = Prisma.ContactGetPayload<{ select: typeof CONTACT_VIEW }>;

/** Aplati la jointure : `tags: [{ tag }]` devient `tags: [tag]`. */
function toView(row: ContactRow) {
  return { ...row, tags: row.tags.map((link) => link.tag) };
}

/** `undefined` = inchangé ; `null` ou chaîne vide = effacé. */
function text(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** E-mail stocké en minuscules (contrainte CHECK en base). */
function email(value: string | null | undefined): string | null | undefined {
  const cleaned = text(value);
  return typeof cleaned === 'string' ? cleaned.toLowerCase() : cleaned;
}

@Injectable()
export class ContactsService {
  constructor(
    private readonly db: TenantDb,
    private readonly audit: AuditService,
  ) {}

  async list(auth: TenantAuth, query: ContactQuery) {
    const scope = dataScopeOf(auth, 'contacts.view');
    const { organizationId } = auth.tenant;
    const where: Prisma.ContactWhereInput = {
      organizationId,
      deletedAt: null,
      ...ownerScopeFilter(auth, scope),
      ...(query.status ? { status: query.status } : {}),
      ...(query.companyId ? { companyId: query.companyId } : {}),
      ...(query.tagId ? { tags: { some: { tagId: query.tagId } } } : {}),
      ...(query.q
        ? {
            OR: [
              { firstName: { contains: query.q, mode: 'insensitive' as const } },
              { lastName: { contains: query.q, mode: 'insensitive' as const } },
              { email: { contains: query.q, mode: 'insensitive' as const } },
              { phone: { contains: query.q, mode: 'insensitive' as const } },
              { jobTitle: { contains: query.q, mode: 'insensitive' as const } },
              { company: { name: { contains: query.q, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };

    const rows = await this.db.run(dbScopeOf(auth), (tx) =>
      tx.contact.findMany({
        where,
        orderBy:
          query.sort === 'name'
            ? [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }]
            : [{ createdAt: 'desc' }, { id: 'desc' }],
        select: CONTACT_VIEW,
        ...cursorArgs(query),
      }),
    );
    return toPage(rows.map(toView), query.limit);
  }

  async findOne(auth: TenantAuth, contactId: string) {
    const scope = dataScopeOf(auth, 'contacts.view');
    const contact = await this.db.run(dbScopeOf(auth), (tx) =>
      tx.contact.findFirst({
        where: {
          id: contactId,
          organizationId: auth.tenant.organizationId,
          deletedAt: null,
          ...ownerScopeFilter(auth, scope),
        },
        select: CONTACT_VIEW,
      }),
    );
    if (!contact) throw AppError.notFound('Contact introuvable.');
    return toView(contact);
  }

  async create(auth: TenantAuth, dto: CreateContactDto) {
    const scope = dataScopeOf(auth, 'contacts.create');
    const { organizationId } = auth.tenant;

    const firstName = text(dto.firstName) ?? null;
    const lastName = text(dto.lastName) ?? null;
    if (firstName === null && lastName === null) {
      throw AppError.badRequest('NAME_REQUIRED', 'Un contact doit avoir au moins un prénom ou un nom.');
    }
    const ownerMembershipId = resolveOwnerId(auth, scope, dto.ownerMembershipId);

    return this.db.run(dbScopeOf(auth), async (tx) => {
      if (dto.companyId) await assertCompanyExists(tx, organizationId, dto.companyId);
      if (ownerMembershipId) await this.assertOwner(tx, organizationId, ownerMembershipId);
      const tagIds = await this.checkedTagIds(tx, organizationId, dto.tagIds);

      const contact = await tx.contact.create({
        data: {
          organizationId,
          firstName,
          lastName,
          email: email(dto.email) ?? null,
          phone: text(dto.phone) ?? null,
          jobTitle: text(dto.jobTitle) ?? null,
          companyId: dto.companyId ?? null,
          status: dto.status ?? 'LEAD',
          source: text(dto.source) ?? null,
          notes: text(dto.notes) ?? null,
          ownerMembershipId,
        },
        select: { id: true },
      });

      if (tagIds.length > 0) {
        await tx.contactTag.createMany({
          data: tagIds.map((tagId) => ({ organizationId, contactId: contact.id, tagId })),
        });
      }

      await this.audit.record(tx, {
        organizationId,
        actorUserId: auth.userId,
        action: 'contact.created',
        entityType: 'contact',
        entityId: contact.id,
        metadata: {
          lastName,
          firstName,
          ...(dto.companyId ? { companyId: dto.companyId } : {}),
        },
      });

      return toView(await tx.contact.findFirstOrThrow({ where: { id: contact.id }, select: CONTACT_VIEW }));
    });
  }

  async update(auth: TenantAuth, contactId: string, dto: UpdateContactDto) {
    const scope = dataScopeOf(auth, 'contacts.update');
    const { organizationId } = auth.tenant;
    const changes = this.changes(dto);
    const touchesTags = dto.tagIds !== undefined;
    if (Object.keys(changes).length === 0 && !touchesTags) {
      throw AppError.badRequest('NO_CHANGES', 'Aucune modification fournie.');
    }

    return this.db.run(dbScopeOf(auth), async (tx) => {
      const current = await this.findEditable(tx, auth, scope, contactId);

      const nextFirstName = dto.firstName !== undefined ? (text(dto.firstName) ?? null) : current.firstName;
      const nextLastName = dto.lastName !== undefined ? (text(dto.lastName) ?? null) : current.lastName;
      if (nextFirstName === null && nextLastName === null) {
        throw AppError.badRequest('NAME_REQUIRED', 'Un contact doit avoir au moins un prénom ou un nom.');
      }

      if (dto.companyId) await assertCompanyExists(tx, organizationId, dto.companyId);
      if (typeof changes.ownerMembershipId === 'string') {
        await this.assertOwner(tx, organizationId, changes.ownerMembershipId);
      }

      await tx.contact.update({ where: { id: contactId }, data: changes });

      if (touchesTags) {
        const tagIds = await this.checkedTagIds(tx, organizationId, dto.tagIds);
        await tx.contactTag.deleteMany({ where: { organizationId, contactId } });
        if (tagIds.length > 0) {
          await tx.contactTag.createMany({
            data: tagIds.map((tagId) => ({ organizationId, contactId, tagId })),
          });
        }
      }

      await this.audit.record(tx, {
        organizationId,
        actorUserId: auth.userId,
        action: 'contact.updated',
        entityType: 'contact',
        entityId: contactId,
        metadata: {
          fields: [...Object.keys(changes), ...(touchesTags ? ['tags'] : [])],
        },
      });

      return toView(await tx.contact.findFirstOrThrow({ where: { id: contactId }, select: CONTACT_VIEW }));
    });
  }

  /** Suppression logique : l'historique (audit, futures opportunités) est conservé. */
  async remove(auth: TenantAuth, contactId: string): Promise<void> {
    const scope = dataScopeOf(auth, 'contacts.delete');
    const { organizationId } = auth.tenant;
    await this.db.run(dbScopeOf(auth), async (tx) => {
      const current = await this.findEditable(tx, auth, scope, contactId);
      await tx.contact.update({ where: { id: contactId }, data: { deletedAt: new Date() } });
      await this.audit.record(tx, {
        organizationId,
        actorUserId: auth.userId,
        action: 'contact.deleted',
        entityType: 'contact',
        entityId: contactId,
        metadata: { firstName: current.firstName, lastName: current.lastName },
      });
    });
  }

  private changes(dto: UpdateContactDto): Prisma.ContactUncheckedUpdateInput {
    const data: Prisma.ContactUncheckedUpdateInput = {};

    const firstName = text(dto.firstName);
    if (firstName !== undefined) data.firstName = firstName;
    const lastName = text(dto.lastName);
    if (lastName !== undefined) data.lastName = lastName;
    const mail = email(dto.email);
    if (mail !== undefined) data.email = mail;
    const phone = text(dto.phone);
    if (phone !== undefined) data.phone = phone;
    const jobTitle = text(dto.jobTitle);
    if (jobTitle !== undefined) data.jobTitle = jobTitle;
    const source = text(dto.source);
    if (source !== undefined) data.source = source;
    const notes = text(dto.notes);
    if (notes !== undefined) data.notes = notes;

    if (dto.status !== undefined) data.status = dto.status;
    // `null` détache l'entreprise, `undefined` ne change rien.
    if (dto.companyId !== undefined) data.companyId = dto.companyId;
    if (dto.ownerMembershipId !== undefined) data.ownerMembershipId = dto.ownerMembershipId;
    return data;
  }

  private async findEditable(tx: Tx, auth: TenantAuth, scope: 'OWN' | 'ORGANIZATION', contactId: string) {
    const contact = await tx.contact.findFirst({
      where: { id: contactId, organizationId: auth.tenant.organizationId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, ownerMembershipId: true },
    });
    if (!contact) throw AppError.notFound('Contact introuvable.');
    assertInScope(scope, contact.ownerMembershipId === auth.tenant.membershipId);
    return contact;
  }

  private async assertOwner(tx: Tx, organizationId: string, membershipId: string): Promise<void> {
    const membership = await tx.membership.findFirst({
      where: { id: membershipId, organizationId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!membership) {
      throw AppError.badRequest(
        'INVALID_OWNER',
        "Le propriétaire doit être un membre actif de l'organisation.",
      );
    }
  }

  /** Vérifie l'appartenance des étiquettes à l'organisation et déduplique. */
  private async checkedTagIds(
    tx: Tx,
    organizationId: string,
    tagIds: string[] | undefined,
  ): Promise<string[]> {
    if (!tagIds || tagIds.length === 0) return [];
    const unique = [...new Set(tagIds)];
    const found = await tx.tag.count({ where: { organizationId, id: { in: unique } } });
    if (found !== unique.length) {
      throw AppError.badRequest('INVALID_TAG', "Une étiquette est introuvable dans l'organisation.");
    }
    return unique;
  }
}
