-- ════════════════════════════════════════════════════════════════════════
-- Phase 2.1 — Entreprises, contacts et étiquettes
--
-- Partie 1 : DDL généré par `prisma migrate diff`.
-- Partie 2 : contraintes, privilèges, RLS et amorçage des permissions,
--            écrits à la main (Prisma ne gère ni les policies ni les GRANT).
-- Référence : docs/rapports/phase-2-demarrage.md
-- ════════════════════════════════════════════════════════════════════════

-- CreateEnum
CREATE TYPE "ContactStatus" AS ENUM ('LEAD', 'PROSPECT', 'CUSTOMER', 'INACTIVE');

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "domain" VARCHAR(255),
    "industry" VARCHAR(100),
    "phone" VARCHAR(40),
    "website" VARCHAR(2048),
    "address_line" VARCHAR(255),
    "city" VARCHAR(120),
    "country" VARCHAR(2),
    "notes" TEXT,
    "owner_membership_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "first_name" VARCHAR(100),
    "last_name" VARCHAR(100),
    "email" VARCHAR(320),
    "phone" VARCHAR(40),
    "job_title" VARCHAR(120),
    "company_id" UUID,
    "status" "ContactStatus" NOT NULL DEFAULT 'LEAD',
    "source" VARCHAR(80),
    "notes" TEXT,
    "owner_membership_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "color" VARCHAR(7) NOT NULL DEFAULT '#64748b',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_tags" (
    "organization_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_tags_pkey" PRIMARY KEY ("contact_id","tag_id")
);

-- CreateIndex
CREATE INDEX "companies_organization_id_deleted_at_idx" ON "companies"("organization_id", "deleted_at");

-- CreateIndex
CREATE INDEX "companies_organization_id_name_idx" ON "companies"("organization_id", "name");

-- CreateIndex
CREATE INDEX "companies_organization_id_owner_membership_id_idx" ON "companies"("organization_id", "owner_membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "companies_organization_id_id_key" ON "companies"("organization_id", "id");

-- CreateIndex
CREATE INDEX "contacts_organization_id_deleted_at_idx" ON "contacts"("organization_id", "deleted_at");

-- CreateIndex
CREATE INDEX "contacts_organization_id_status_idx" ON "contacts"("organization_id", "status");

-- CreateIndex
CREATE INDEX "contacts_organization_id_company_id_idx" ON "contacts"("organization_id", "company_id");

-- CreateIndex
CREATE INDEX "contacts_organization_id_owner_membership_id_idx" ON "contacts"("organization_id", "owner_membership_id");

-- CreateIndex
CREATE INDEX "contacts_organization_id_email_idx" ON "contacts"("organization_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_organization_id_id_key" ON "contacts"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "tags_organization_id_id_key" ON "tags"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "tags_organization_id_name_key" ON "tags"("organization_id", "name");

-- CreateIndex
CREATE INDEX "contact_tags_organization_id_idx" ON "contact_tags"("organization_id");

-- CreateIndex
CREATE INDEX "contact_tags_tag_id_idx" ON "contact_tags"("tag_id");

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_organization_id_owner_membership_id_fkey" FOREIGN KEY ("organization_id", "owner_membership_id") REFERENCES "memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organization_id_company_id_fkey" FOREIGN KEY ("organization_id", "company_id") REFERENCES "companies"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organization_id_owner_membership_id_fkey" FOREIGN KEY ("organization_id", "owner_membership_id") REFERENCES "memberships"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_organization_id_contact_id_fkey" FOREIGN KEY ("organization_id", "contact_id") REFERENCES "contacts"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_organization_id_tag_id_fkey" FOREIGN KEY ("organization_id", "tag_id") REFERENCES "tags"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ════════════════════════════════════════════════════════════════════════
-- 2. Contraintes complémentaires
-- ════════════════════════════════════════════════════════════════════════

-- Un contact sans nom ni prénom serait inexploitable dans les listes.
ALTER TABLE contacts ADD CONSTRAINT contacts_identity_present
  CHECK (first_name IS NOT NULL OR last_name IS NOT NULL);
-- E-mail stocké normalisé (trim + minuscules), comme pour users et invitations.
ALTER TABLE contacts ADD CONSTRAINT contacts_email_normalized
  CHECK (email IS NULL OR email = lower(btrim(email)));
ALTER TABLE companies ADD CONSTRAINT companies_country_format
  CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');
ALTER TABLE tags ADD CONSTRAINT tags_color_format
  CHECK (color ~ '^#[0-9a-f]{6}$');
-- « Client » et « client » sont la même étiquette : l'unicité est insensible à la casse.
CREATE UNIQUE INDEX tags_organization_id_name_ci
  ON tags (organization_id, lower(name));

-- ════════════════════════════════════════════════════════════════════════
-- 3. Privilèges (moindre privilège, table par table)
-- ════════════════════════════════════════════════════════════════════════

GRANT SELECT, INSERT, UPDATE, DELETE ON companies TO crm_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON contacts TO crm_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON tags TO crm_app;
GRANT SELECT, INSERT, DELETE ON contact_tags TO crm_app;

-- ════════════════════════════════════════════════════════════════════════
-- 4. Row Level Security
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies FORCE ROW LEVEL SECURITY;
CREATE POLICY companies_tenant ON companies
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts FORCE ROW LEVEL SECURITY;
CREATE POLICY contacts_tenant ON contacts
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags FORCE ROW LEVEL SECURITY;
CREATE POLICY tags_tenant ON tags
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

ALTER TABLE contact_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_tags FORCE ROW LEVEL SECURITY;
CREATE POLICY contact_tags_tenant ON contact_tags
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

-- ════════════════════════════════════════════════════════════════════════
-- 5. Amorçage des permissions de la phase 2.1
--
-- La table `permissions` est normalement alimentée par prisma/sync-permissions.ts,
-- mais ce script tourne APRÈS `prisma migrate deploy` : les lignes doivent donc
-- exister ici pour que les FK de role_permissions soient satisfaites. Le script
-- reste idempotent (upsert) et fait foi ensuite.
--
-- role_permissions porte une RLS forcée : sans contexte d'organisation, aucune
-- ligne n'est insérable. On la lève le temps de l'amorçage.
-- ════════════════════════════════════════════════════════════════════════

INSERT INTO permissions (key, description, scoped) VALUES
  ('contacts.view',     'Consulter les contacts',                                true),
  ('contacts.create',   'Créer des contacts',                                    true),
  ('contacts.update',   'Modifier les contacts',                                 true),
  ('contacts.delete',   'Supprimer des contacts',                                true),
  ('companies.view',    'Consulter les entreprises',                             true),
  ('companies.manage',  'Créer, modifier et supprimer des entreprises',          true),
  ('tags.manage',       'Créer, renommer et supprimer les étiquettes',           false)
ON CONFLICT (key) DO UPDATE
  SET description = EXCLUDED.description, scoped = EXCLUDED.scoped;

ALTER TABLE role_permissions DISABLE ROW LEVEL SECURITY;

-- Propriétaire et administrateur : toutes les permissions du lot.
INSERT INTO role_permissions (organization_id, role_id, permission_key, scope)
SELECT r.organization_id, r.id, p.key, 'ORGANIZATION'
FROM roles r
CROSS JOIN (VALUES
  ('contacts.view'), ('contacts.create'), ('contacts.update'), ('contacts.delete'),
  ('companies.view'), ('companies.manage'), ('tags.manage')
) AS p(key)
WHERE r.system_key IN ('owner', 'admin')
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- Membre : consultation et saisie, sans suppression ni gestion des étiquettes.
INSERT INTO role_permissions (organization_id, role_id, permission_key, scope)
SELECT r.organization_id, r.id, p.key, 'ORGANIZATION'
FROM roles r
CROSS JOIN (VALUES
  ('contacts.view'), ('contacts.create'), ('contacts.update'),
  ('companies.view'), ('companies.manage')
) AS p(key)
WHERE r.system_key = 'member'
ON CONFLICT (role_id, permission_key) DO NOTHING;

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions FORCE ROW LEVEL SECURITY;
