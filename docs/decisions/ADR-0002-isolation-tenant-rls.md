# ADR-0002 — Isolation multi-tenant : filtre applicatif + RLS + clés étrangères composites

- **Statut :** accepté (2026-11-13)
- **Contexte :** cahier §6.1. Une fuite entre organisations est le risque le plus grave du produit.

## Décision

1. Base et schéma partagés, `organization_id` sur chaque table d'organisation.
2. L'API se connecte avec un rôle PostgreSQL **sans privilège** (`crm_app`) ; un second rôle sert
   aux migrations. L'API refuse de démarrer avec un rôle superutilisateur ou `BYPASSRLS`.
3. Le contexte tenant est posé **par transaction** avec `set_config(..., true)` dans `TenantDb.run`.
4. Les services filtrent en plus explicitement sur `organizationId`.
5. Les relations intra-tenant utilisent des clés étrangères composites `(organization_id, id)`.
6. Policies et privilèges sont écrits à la main dans les migrations SQL.

## Alternatives écartées

| Alternative | Raison du rejet |
| --- | --- |
| Filtre applicatif seul | Un filtre oublié = une fuite silencieuse |
| Extension Prisma injectant le filtre automatiquement | Magie implicite, contournable par le SQL brut ; la RLS couvre le même besoin au bon niveau |
| Contexte posé par session (`SET`) | Fuit entre requêtes avec un pool de connexions ; incompatible avec un pooler en mode transaction |
| Une base ou un schéma par tenant | Coût d'exploitation et de migration disproportionné au lancement ; reste possible pour un client « Enterprise » |

## Conséquences

- Chaque accès tenant coûte une transaction et un `set_config` (négligeable devant la requête).
- Aucun travail lent (hachage, appel réseau) ne doit avoir lieu dans `TenantDb.run`.
- `INSERT … RETURNING` est soumis aux policies de lecture : l'audit hors tenant utilise `createMany`.
- Les tables d'identité globales ne sont pas protégées par la RLS (voir document 04, §1.3).
