import { randomBytes, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { SYSTEM_ROLES } from '../permissions/permission-catalog';
import { type Tx, applyDbScope } from '../../database/tenant-db.service';

export interface NewOrganizationInput {
  name: string;
  country: string;
  currency: string;
  timezone: string;
  locale?: string;
}

/** Transforme un nom en identifiant d'URL ; un suffixe aléatoire évite les collisions. */
export function buildSlug(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  const suffix = randomBytes(4).toString('hex');
  return base ? `${base}-${suffix}` : `org-${suffix}`;
}

@Injectable()
export class OrganizationProvisioner {
  constructor(private readonly audit: AuditService) {}

  /**
   * Crée une organisation complète dans la transaction fournie :
   * organisation + rôles système + membership propriétaire.
   *
   * La transaction est basculée sur le contexte de la NOUVELLE organisation
   * (identifiant généré ici, côté serveur) : c'est ce qui autorise les
   * insertions au regard des policies RLS.
   */
  async provision(tx: Tx, ownerUserId: string, input: NewOrganizationInput) {
    const organizationId = randomUUID();
    await applyDbScope(tx, { organizationId, userId: ownerUserId });

    const organization = await tx.organization.create({
      data: {
        id: organizationId,
        name: input.name,
        slug: buildSlug(input.name),
        country: input.country,
        currency: input.currency,
        timezone: input.timezone,
        ...(input.locale ? { locale: input.locale } : {}),
      },
    });

    let ownerRoleId: string | undefined;
    for (const definition of SYSTEM_ROLES) {
      const role = await tx.role.create({
        data: {
          organizationId,
          systemKey: definition.key,
          name: definition.name,
          description: definition.description,
          permissions: {
            create: definition.permissions.map((permissionKey) => ({
              permissionKey,
              scope: 'ORGANIZATION' as const,
            })),
          },
        },
      });
      if (definition.key === 'owner') ownerRoleId = role.id;
    }
    if (!ownerRoleId) throw new Error('Rôle système « owner » absent du catalogue.');

    const membership = await tx.membership.create({
      data: { organizationId, userId: ownerUserId, roleId: ownerRoleId },
    });

    await this.audit.record(tx, {
      organizationId,
      actorUserId: ownerUserId,
      action: 'organization.created',
      entityType: 'organization',
      entityId: organizationId,
      metadata: { name: organization.name, slug: organization.slug },
    });

    return { organization, membership };
  }
}
