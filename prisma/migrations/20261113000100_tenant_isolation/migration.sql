-- ════════════════════════════════════════════════════════════════════════
-- Isolation multi-tenant : rôle applicatif, privilèges et Row Level Security
-- Écrit à la main (Prisma ne gère ni les policies ni les GRANT).
-- Référence : docs/architecture/04-multi-tenant-et-rbac.md
-- ════════════════════════════════════════════════════════════════════════

-- 1. Rôle applicatif ------------------------------------------------------
-- L'API se connecte avec crm_app : ni superutilisateur, ni BYPASSRLS, ni
-- propriétaire des tables. Le rôle est créé sans LOGIN ; l'infrastructure lui
-- attribue LOGIN + mot de passe (scripts/dev-db.mjs en local). Si le rôle de
-- migration n'a pas CREATEROLE, crm_app doit exister avant la migration.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crm_app') THEN
    CREATE ROLE crm_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO crm_app;

-- 2. Contexte de requête --------------------------------------------------
-- Posé par l'API au début de chaque transaction via set_config(..., true)
-- (portée transaction : aucun risque de fuite entre connexions du pool).
-- Une valeur absente ou vide donne NULL => aucune ligne visible (fail closed).
CREATE FUNCTION app_current_org_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.current_org_id', true), '')::uuid $$;

CREATE FUNCTION app_current_user_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid $$;

CREATE FUNCTION app_invitation_token_hash() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.invitation_token_hash', true), '') $$;

GRANT EXECUTE ON FUNCTION app_current_org_id(), app_current_user_id(), app_invitation_token_hash() TO crm_app;

-- 3. Contraintes complémentaires -------------------------------------------
ALTER TABLE users ADD CONSTRAINT users_email_normalized CHECK (email = lower(btrim(email)));
ALTER TABLE invitations ADD CONSTRAINT invitations_email_normalized CHECK (email = lower(btrim(email)));
ALTER TABLE organizations ADD CONSTRAINT organizations_country_format CHECK (country ~ '^[A-Z]{2}$');
ALTER TABLE organizations ADD CONSTRAINT organizations_currency_format CHECK (currency ~ '^[A-Z]{3}$');
ALTER TABLE organizations ADD CONSTRAINT organizations_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

-- Une seule invitation en attente par e-mail et par organisation.
CREATE UNIQUE INDEX invitations_one_pending_per_email
  ON invitations (organization_id, email) WHERE status = 'PENDING';

-- 4. Privilèges (moindre privilège, table par table) -----------------------
-- Tables d'identité globales (pas de organization_id) : accès réservé au
-- module auth côté application.
GRANT SELECT, INSERT, UPDATE ON users TO crm_app;
GRANT SELECT, INSERT, UPDATE ON sessions TO crm_app;
GRANT SELECT, INSERT, UPDATE ON refresh_tokens TO crm_app;
GRANT SELECT, INSERT, UPDATE ON user_tokens TO crm_app;
-- Catalogue des permissions : lecture seule (écrit par le rôle de migration).
GRANT SELECT ON permissions TO crm_app;
-- Tables tenant.
GRANT SELECT, INSERT, UPDATE ON organizations TO crm_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON roles TO crm_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON role_permissions TO crm_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON memberships TO crm_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON invitations TO crm_app;
-- Audit : ajout seul.
GRANT SELECT, INSERT ON audit_logs TO crm_app;

-- 5. Row Level Security ----------------------------------------------------
-- FORCE : la RLS s'applique aussi au propriétaire des tables (hors superuser).

-- organizations ------------------------------------------------------------
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;

-- Lecture : l'organisation active ; ou, HORS contexte d'organisation
-- (connexion, sélecteur d'organisation), celles dont l'utilisateur est membre.
CREATE POLICY organizations_select ON organizations FOR SELECT USING (
  id = app_current_org_id()
  OR (
    app_current_org_id() IS NULL
    AND id IN (SELECT m.organization_id FROM memberships m WHERE m.user_id = app_current_user_id())
  )
);
CREATE POLICY organizations_insert ON organizations FOR INSERT
  WITH CHECK (id = app_current_org_id());
CREATE POLICY organizations_update ON organizations FOR UPDATE
  USING (id = app_current_org_id())
  WITH CHECK (id = app_current_org_id());

-- memberships --------------------------------------------------------------
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;

CREATE POLICY memberships_select ON memberships FOR SELECT USING (
  organization_id = app_current_org_id()
  OR (app_current_org_id() IS NULL AND user_id = app_current_user_id())
);
CREATE POLICY memberships_insert ON memberships FOR INSERT
  WITH CHECK (organization_id = app_current_org_id());
CREATE POLICY memberships_update ON memberships FOR UPDATE
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());
CREATE POLICY memberships_delete ON memberships FOR DELETE
  USING (organization_id = app_current_org_id());

-- roles --------------------------------------------------------------------
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;

CREATE POLICY roles_tenant ON roles
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

-- role_permissions ---------------------------------------------------------
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions FORCE ROW LEVEL SECURITY;

CREATE POLICY role_permissions_tenant ON role_permissions
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());

-- invitations --------------------------------------------------------------
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;

-- Lecture : l'organisation active ; ou, HORS contexte d'organisation, la
-- seule invitation dont on présente le jeton (acceptation par l'invité).
CREATE POLICY invitations_select ON invitations FOR SELECT USING (
  organization_id = app_current_org_id()
  OR (app_current_org_id() IS NULL AND token_hash = app_invitation_token_hash())
);
CREATE POLICY invitations_insert ON invitations FOR INSERT
  WITH CHECK (organization_id = app_current_org_id());
CREATE POLICY invitations_update ON invitations FOR UPDATE
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());
CREATE POLICY invitations_delete ON invitations FOR DELETE
  USING (organization_id = app_current_org_id());

-- audit_logs ---------------------------------------------------------------
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

-- Les événements hors tenant (organization_id NULL) peuvent être écrits mais
-- ne sont lisibles par aucun tenant (console éditeur : phase ultérieure).
CREATE POLICY audit_logs_select ON audit_logs FOR SELECT
  USING (organization_id = app_current_org_id());
CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT
  WITH CHECK (organization_id IS NULL OR organization_id = app_current_org_id());
