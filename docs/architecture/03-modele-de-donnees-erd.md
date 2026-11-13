# 03 — Modèle de données et ERD

Deux niveaux de précision, volontairement distincts :

1. **Phase 1 — implémenté.** Diagramme exact, conforme à [schema.prisma](../../prisma/schema.prisma)
   et aux migrations appliquées.
2. **Phases suivantes — cible.** Diagrammes par domaine servant de plan. Ces tables **n'existent
   pas** ; champs, nullabilités et contraintes seront figés dans la migration de leur phase
   (cahier §6.3, dernier paragraphe).

## 1. Conventions (appliquées en phase 1, obligatoires ensuite)

| Règle | Détail |
| --- | --- |
| Identifiants | UUID générés par PostgreSQL (`gen_random_uuid()`) |
| Horodatage | `timestamptz` en UTC ; `created_at` partout, `updated_at` sur les entités modifiables |
| Tenant | `organization_id NOT NULL` + index sur toute table d'organisation |
| Relations intra-tenant | **Clé étrangère composite** `(organization_id, x_id) → (organization_id, id)` : la base refuse de lier deux entités d'organisations différentes |
| Unicité | Toujours composée avec `organization_id` (ex. nom de rôle) |
| RLS | `ENABLE` + `FORCE` + policies dans la migration SQL de la table |
| Privilèges | `GRANT` explicites et minimaux au rôle `crm_app` |
| Montants | `NUMERIC` + colonne devise ISO 4217, jamais de flottant (à partir de la phase 3) |
| Suppression logique | `deleted_at` seulement là où le métier l'exige |
| Historique | Tables d'événements en ajout seul pour l'audit, les paiements, les changements d'étape |

## 2. Phase 1 — implémenté ✅

```mermaid
erDiagram
  users ||--o{ sessions : "ouvre"
  sessions ||--o{ refresh_tokens : "rotation"
  users ||--o{ user_tokens : "vérification / réinitialisation"
  users ||--o{ memberships : "appartient via"
  organizations ||--o{ memberships : "a pour membres"
  organizations ||--o{ roles : "définit"
  roles ||--o{ memberships : "attribué à"
  roles ||--o{ role_permissions : "accorde"
  permissions ||--o{ role_permissions : "référencée par"
  organizations ||--o{ invitations : "émet"
  roles ||--o{ invitations : "rôle proposé"
  users |o--o{ invitations : "invité par"
  organizations |o--o{ audit_logs : "trace"
  users |o--o{ audit_logs : "acteur"
  organizations |o--o{ sessions : "organisation active"

  users {
    uuid id PK
    varchar email UK "normalisé en minuscules (CHECK)"
    varchar name
    varchar password_hash "Argon2id"
    enum status "ACTIVE | DISABLED"
    timestamptz email_verified_at "nullable"
    int failed_login_count
    timestamptz locked_until "nullable"
  }
  sessions {
    uuid id PK
    uuid user_id FK
    uuid active_organization_id FK "nullable"
    timestamptz expires_at
    timestamptz revoked_at "nullable"
    varchar revoked_reason "nullable"
  }
  refresh_tokens {
    uuid id PK
    uuid session_id FK
    char token_hash UK "SHA-256"
    timestamptz used_at "rotation : usage unique"
  }
  user_tokens {
    uuid id PK
    uuid user_id FK
    enum type "EMAIL_VERIFICATION | PASSWORD_RESET"
    char token_hash UK
    timestamptz consumed_at "nullable"
  }
  permissions {
    varchar key PK "ex. members.invite"
    varchar description
    boolean scoped
  }
  organizations {
    uuid id PK
    varchar name
    varchar slug UK
    varchar country "ISO 3166-1 (CHECK)"
    varchar currency "ISO 4217 (CHECK)"
    varchar timezone "IANA"
    enum status "ACTIVE | SUSPENDED | CLOSED"
  }
  roles {
    uuid id PK
    uuid organization_id FK
    varchar system_key "owner | admin | member | NULL"
    varchar name "unique par organisation"
  }
  role_permissions {
    uuid role_id PK
    varchar permission_key PK
    uuid organization_id FK "FK composite avec role_id"
    enum scope "OWN | TEAM | DEPARTMENT | ORGANIZATION"
  }
  memberships {
    uuid id PK
    uuid organization_id FK
    uuid user_id FK "unique par organisation"
    uuid role_id FK "FK composite avec organization_id"
    enum status "ACTIVE | SUSPENDED"
  }
  invitations {
    uuid id PK
    uuid organization_id FK
    varchar email "une seule PENDING par e-mail et organisation"
    uuid role_id FK "FK composite"
    char token_hash UK
    enum status "PENDING | ACCEPTED | REVOKED"
    timestamptz expires_at
  }
  audit_logs {
    uuid id PK
    uuid organization_id FK "nullable : événement hors tenant"
    uuid actor_user_id FK "nullable"
    varchar action
    varchar entity_type
    varchar entity_id
    jsonb metadata
    varchar request_id
  }
```

### Nature des tables

| Table | Portée | RLS | Droits de `crm_app` |
| --- | --- | --- | --- |
| `users`, `sessions`, `refresh_tokens`, `user_tokens` | Globale (identité) | Non | SELECT, INSERT, UPDATE |
| `permissions` | Globale (catalogue) | Non | SELECT seulement |
| `organizations` | Tenant (racine) | Oui | SELECT, INSERT, UPDATE |
| `roles`, `role_permissions`, `memberships`, `invitations` | Tenant | Oui | SELECT, INSERT, UPDATE, DELETE |
| `audit_logs` | Tenant | Oui | SELECT, INSERT (**ajout seul**) |

### Écarts par rapport au §6.2 du cahier

| Écart | Raison |
| --- | --- |
| Tables ajoutées : `sessions`, `refresh_tokens`, `user_tokens`, `invitations` | Nécessaires à la révocation de session, à la vérification d'e-mail, à la réinitialisation et à l'ajout de membres |
| `permissions.key` sert de clé primaire (pas d'`id`) | La clé est l'identifiant stable utilisé par le code |
| `role_permissions.scope` et `organization_id` ajoutés | Portées RBAC (§8.2) et RLS |
| `roles.system_key` ajouté | Distinguer les rôles système non modifiables |
| `teams`, `team_members`, `departments` absents | Créés en phase 2, quand la portée `TEAM`/`DEPARTMENT` s'appliquera à des ressources réelles |

## 3. Cible — phases suivantes 🟡 (non implémenté)

Toutes les tables ci-dessous portent `organization_id` (sauf mention « global ») et suivront les
conventions du §1. Seules les relations structurantes sont montrées.

### Phase 2 — Équipes, contacts, entreprises, leads

```mermaid
erDiagram
  organizations ||--o{ teams : ""
  organizations ||--o{ departments : ""
  teams ||--o{ team_members : ""
  memberships ||--o{ team_members : ""
  departments ||--o{ memberships : "rattachement"
  organizations ||--o{ contacts : ""
  organizations ||--o{ companies : ""
  contacts ||--o{ contact_companies : ""
  companies ||--o{ contact_companies : "fonction"
  contacts ||--o{ contact_tags : ""
  tags ||--o{ contact_tags : ""
  contacts ||--o{ contact_notes : ""
  memberships ||--o{ contacts : "propriétaire"
  lead_sources ||--o{ leads : ""
  contacts |o--o{ leads : "converti en"
  memberships ||--o{ leads : "propriétaire"
  leads ||--o{ lead_status_history : ""
  custom_field_definitions ||--o{ custom_field_values : ""
  organizations ||--o{ import_jobs : ""
  organizations ||--o{ files : "métadonnées (binaire en stockage objet)"
```

Précisions par rapport au cahier :

- `team_members` référence `memberships` (et non `users`) : l'appartenance à une équipe n'a de sens
  que dans une organisation.
- Le propriétaire d'une ressource (`owner_…`) référence un **membership** de la même organisation
  via FK composite, pas un utilisateur global.
- `custom_field_values` et, plus tard, `activity_relations` sont **polymorphes** (`entity_type`,
  `entity_id`) : pas de clé étrangère possible. L'isolation repose alors sur `organization_id` +
  RLS, et l'existence de la cible est vérifiée dans la transaction.
- Ajouts nécessaires non listés au §6.2 : `lead_status_history`, `import_jobs`, `files`,
  `saved_views`.

### Phase 3 — Pipelines, opportunités, activités, tâches

```mermaid
erDiagram
  pipelines ||--o{ pipeline_stages : "ordonnées"
  pipelines ||--o{ deals : ""
  pipeline_stages ||--o{ deals : "étape courante"
  contacts |o--o{ deals : ""
  companies |o--o{ deals : ""
  memberships ||--o{ deals : "propriétaire"
  lost_reasons |o--o{ deals : ""
  deals ||--o{ deal_stage_history : "ajout seul"
  deals ||--o{ deal_products : ""
  products ||--o{ deal_products : ""
  activities ||--o{ activity_relations : "polymorphe"
  memberships ||--o{ activities : ""
  memberships ||--o{ tasks : "responsable"
  tasks ||--o{ task_comments : ""
  appointments ||--o{ reminders : ""
```

### Phase 4 — Devis, factures, paiements (clients du CRM)

```mermaid
erDiagram
  contacts ||--o{ quotes : ""
  quotes ||--o{ quote_items : ""
  quotes |o--o{ invoices : "conversion tracée"
  invoices ||--o{ invoice_items : ""
  invoices ||--o{ payments : "partiels possibles"
  invoices ||--o{ invoice_events : "ajout seul"
  payments ||--o{ payment_events : "ajout seul"
  tax_rates ||--o{ quote_items : ""
  tax_rates ||--o{ invoice_items : ""
  organizations ||--o{ document_sequences : "numérotation"
  organizations ||--o{ idempotency_keys : ""
```

Ajouts : `document_sequences` (numérotation sans trou, verrouillée), `invoice_events`,
`payment_events`, `idempotency_keys`, `webhook_events` (déduplication). Strictement séparé des
tables SaaS de l'éditeur.

### Phases 5 à 9 — Marketing, support, abonnements SaaS, automatisations, IA, RH

```mermaid
erDiagram
  campaigns ||--o{ campaign_recipients : ""
  contacts ||--o{ campaign_recipients : ""
  segments ||--o{ campaigns : "audience"
  email_templates ||--o{ campaigns : ""
  campaign_recipients ||--o{ message_events : ""
  contacts ||--o{ consent_records : "ajout seul"
  contacts ||--o{ suppression_records : ""

  contacts |o--o{ tickets : ""
  ticket_categories ||--o{ tickets : ""
  tickets ||--o{ ticket_messages : "public / interne"
  tickets ||--o{ ticket_assignments : ""
  tickets |o--o| satisfaction_surveys : ""

  plans ||--o{ plan_features : "global"
  plans ||--o{ subscriptions : ""
  organizations ||--o| subscriptions : ""
  subscriptions ||--o{ subscription_events : ""
  organizations ||--o{ saas_invoices : ""
  saas_invoices ||--o{ saas_payments : ""
  organizations ||--o{ usage_records : ""

  workflows ||--o{ workflow_versions : ""
  workflows ||--o{ workflow_executions : ""
  workflow_executions ||--o{ workflow_step_executions : ""
  workflow_executions ||--o{ workflow_logs : ""

  ai_conversations ||--o{ ai_messages : ""
  organizations ||--o{ ai_usage : ""

  memberships ||--o| employee_profiles : ""
  memberships ||--o{ performance_goals : ""
  leave_types ||--o{ leave_requests : ""
  memberships ||--o{ leave_requests : ""
```

`plans`, `plan_features` et `coupons` sont globaux (gérés par l'éditeur, lecture seule pour
`crm_app`). `knowledge_articles`, `webhook_endpoints`, `ai_provider_configs`,
`ai_knowledge_sources`, `performance_records` complètent ces domaines comme décrit au §6.2.

## 4. Procédure pour ajouter une table tenant

1. Modèle Prisma avec `organizationId`, `@@unique([organizationId, id])` et relations composites.
2. `npx prisma migrate diff` pour générer le SQL, puis **ajouter à la main** dans la même migration :
   `ENABLE` / `FORCE ROW LEVEL SECURITY`, les policies, les `GRANT`.
3. Lancer `npm test` : [rls.e2e-spec.ts](../../apps/api/test/rls.e2e-spec.ts) échoue tant que la
   table n'a pas de RLS forcée, et sa liste de tables attendues doit être mise à jour consciemment.
4. Ajouter les tests d'accès croisé du module.
