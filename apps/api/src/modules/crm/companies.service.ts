import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { type TenantAuth, dbScopeOf } from '../../common/auth-context';
import { AppError } from '../../common/errors';
import { cursorArgs, toPage } from '../../common/pagination';
import { TenantDb, type Tx } from '../../database/tenant-db.service';
import { AuditService } from '../audit/audit.service';
import { assertInScope, dataScopeOf, ownerScopeFilter, resolveOwnerId } from './data-scope';
import type { CompanyQuery, CreateCompanyDto, UpdateCompanyDto } from './dto/crm.dto';

const COMPANY_VIEW = {
  id: true,
  name: true,
  domain: true,
  industry: true,
  phone: true,
  website: true,
  addressLine: true,
  city: true,
  country: true,
  notes: true,
  ownerMembershipId: true,
  createdAt: true,
  updatedAt: true,
  owner: { select: { id: true, user: { select: { id: true, name: true, email: true } } } },
  // Comptage filtré : les fiches en suppression logique ne sont pas comptées.
  _count: { select: { contacts: { where: { deletedAt: null } } } },
} as const;

type CompanyRow = Prisma.CompanyGetPayload<{ select: typeof COMPANY_VIEW }>;

function toView(row: CompanyRow) {
  const { _count, ...company } = row;
  return { ...company, contactCount: _count.contacts };
}

/** `undefined` = inchangé ; `null` ou chaîne vide = effacé. */
function text(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

@Injectable()
export class CompaniesService {
  constructor(
    private readonly db: TenantDb,
    private readonly audit: AuditService,
  ) {}

  async list(auth: TenantAuth, query: CompanyQuery) {
    const scope = dataScopeOf(auth, 'companies.view');
    const { organizationId } = auth.tenant;
    const where: Prisma.CompanyWhereInput = {
      organizationId,
      deletedAt: null,
      ...ownerScopeFilter(auth, scope),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' as const } },
              { domain: { contains: query.q, mode: 'insensitive' as const } },
              { city: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const rows = await this.db.run(dbScopeOf(auth), (tx) =>
      tx.company.findMany({
        where,
        orderBy:
          query.sort === 'name' ? [{ name: 'asc' }, { id: 'asc' }] : [{ createdAt: 'desc' }, { id: 'desc' }],
        select: COMPANY_VIEW,
        ...cursorArgs(query),
      }),
    );
    return toPage(rows.map(toView), query.limit);
  }

  async findOne(auth: TenantAuth, companyId: string) {
    const scope = dataScopeOf(auth, 'companies.view');
    const company = await this.db.run(dbScopeOf(auth), (tx) =>
      tx.company.findFirst({
        where: {
          id: companyId,
          organizationId: auth.tenant.organizationId,
          deletedAt: null,
          ...ownerScopeFilter(auth, scope),
        },
        select: COMPANY_VIEW,
      }),
    );
    if (!company) throw AppError.notFound('Entreprise introuvable.');
    return toView(company);
  }

  async create(auth: TenantAuth, dto: CreateCompanyDto) {
    const scope = dataScopeOf(auth, 'companies.manage');
    const { organizationId } = auth.tenant;
    const ownerMembershipId = resolveOwnerId(auth, scope, dto.ownerMembershipId);

    return this.db.run(dbScopeOf(auth), async (tx) => {
      if (ownerMembershipId) await this.assertOwner(tx, organizationId, ownerMembershipId);

      const company = await tx.company.create({
        data: {
          organizationId,
          name: dto.name,
          domain: text(dto.domain) ?? null,
          industry: text(dto.industry) ?? null,
          phone: text(dto.phone) ?? null,
          website: text(dto.website) ?? null,
          addressLine: text(dto.addressLine) ?? null,
          city: text(dto.city) ?? null,
          country: text(dto.country) ?? null,
          notes: text(dto.notes) ?? null,
          ownerMembershipId,
        },
        select: COMPANY_VIEW,
      });
      await this.audit.record(tx, {
        organizationId,
        actorUserId: auth.userId,
        action: 'company.created',
        entityType: 'company',
        entityId: company.id,
        metadata: { name: company.name },
      });
      return toView(company);
    });
  }

  async update(auth: TenantAuth, companyId: string, dto: UpdateCompanyDto) {
    const scope = dataScopeOf(auth, 'companies.manage');
    const { organizationId } = auth.tenant;
    const changes = this.changes(dto);
    if (Object.keys(changes).length === 0) {
      throw AppError.badRequest('NO_CHANGES', 'Aucune modification fournie.');
    }

    return this.db.run(dbScopeOf(auth), async (tx) => {
      await this.findEditable(tx, auth, scope, companyId);

      if (dto.ownerMembershipId) {
        await this.assertOwner(tx, organizationId, dto.ownerMembershipId);
      }

      const company = await tx.company.update({
        where: { id: companyId },
        data: changes,
        select: COMPANY_VIEW,
      });
      await this.audit.record(tx, {
        organizationId,
        actorUserId: auth.userId,
        action: 'company.updated',
        entityType: 'company',
        entityId: companyId,
        metadata: { name: company.name, fields: Object.keys(changes) },
      });
      return toView(company);
    });
  }

  /**
   * Suppression logique : un contact, puis plus tard une opportunité ou une
   * facture, peut encore référencer l'entreprise. La ligne reste en base et
   * sort des listes (`deleted_at IS NULL`).
   */
  async remove(auth: TenantAuth, companyId: string): Promise<void> {
    const scope = dataScopeOf(auth, 'companies.manage');
    const { organizationId } = auth.tenant;
    await this.db.run(dbScopeOf(auth), async (tx) => {
      const current = await this.findEditable(tx, auth, scope, companyId);

      const linked = await tx.contact.count({
        where: { organizationId, companyId, deletedAt: null },
      });
      if (linked > 0) {
        throw AppError.conflict(
          'COMPANY_IN_USE',
          `Cette entreprise est rattachée à ${linked} contact(s) actif(s). Détachez-les d'abord.`,
        );
      }

      await tx.company.update({ where: { id: companyId }, data: { deletedAt: new Date() } });
      await this.audit.record(tx, {
        organizationId,
        actorUserId: auth.userId,
        action: 'company.deleted',
        entityType: 'company',
        entityId: companyId,
        metadata: { name: current.name },
      });
    });
  }

  /** Construit le patch Prisma : seuls les champs présents dans le DTO changent. */
  private changes(dto: UpdateCompanyDto): Prisma.CompanyUncheckedUpdateInput {
    const data: Prisma.CompanyUncheckedUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;

    const domain = text(dto.domain);
    if (domain !== undefined) data.domain = domain;
    const industry = text(dto.industry);
    if (industry !== undefined) data.industry = industry;
    const phone = text(dto.phone);
    if (phone !== undefined) data.phone = phone;
    const website = text(dto.website);
    if (website !== undefined) data.website = website;
    const addressLine = text(dto.addressLine);
    if (addressLine !== undefined) data.addressLine = addressLine;
    const city = text(dto.city);
    if (city !== undefined) data.city = city;
    const country = text(dto.country);
    if (country !== undefined) data.country = country;
    const notes = text(dto.notes);
    if (notes !== undefined) data.notes = notes;

    // Le champ scalaire est écrit directement : la FK composite (organization_id,
    // owner_membership_id) garantit que le membre appartient bien à l'organisation.
    if (dto.ownerMembershipId !== undefined) data.ownerMembershipId = dto.ownerMembershipId;
    return data;
  }

  private async findEditable(tx: Tx, auth: TenantAuth, scope: 'OWN' | 'ORGANIZATION', companyId: string) {
    const company = await tx.company.findFirst({
      where: { id: companyId, organizationId: auth.tenant.organizationId, deletedAt: null },
      select: { id: true, name: true, ownerMembershipId: true },
    });
    if (!company) throw AppError.notFound('Entreprise introuvable.');
    assertInScope(scope, company.ownerMembershipId === auth.tenant.membershipId);
    return company;
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
}

/** Réutilisé par le service des contacts (rattachement entreprise). */
export async function assertCompanyExists(tx: Tx, organizationId: string, companyId: string): Promise<void> {
  const company = await tx.company.findFirst({
    where: { id: companyId, organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!company) throw AppError.badRequest('INVALID_COMPANY', 'Entreprise introuvable.');
}
