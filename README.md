# CRM SaaS — plateforme multi-tenant

Monorepo de la plateforme CRM décrite dans le
[cahier des charges](cahier_des_charges_CRM_SaaS.md).

**État : phases 1a, 1b et lot 2.1 terminés.** L'API gère l'authentification, les organisations, les
membres, les rôles, l'audit, et le premier module métier : **contacts, entreprises et étiquettes**,
avec les portées `OWN` et `ORGANIZATION` réellement appliquées. L'interface **Louk's CRM** est servie
sur <https://crm.timestradinginter.com> et consomme l'API sur
<https://api-crm.timestradinginter.com> (Render + Neon). Les modules ventes et facturation n'existent
pas encore, ni l'application mobile.

## Ce qui fonctionne / ce qui n'existe pas

| Fonctionne (implémenté et testé) | N'existe pas encore |
| --- | --- |
| Inscription, connexion, déconnexion, rotation des jetons | Application mobile |
| **Interface web React** : auth, contacts, entreprises, équipe, invitations, rôles, audit, organisation | Ventes, devis, facturation, campagnes, support |
| Vérification d'e-mail et réinitialisation du mot de passe, avec pages dédiées dans le front | MFA, OAuth social |
| Organisations, multi-appartenance, changement d'organisation active | MFA, OAuth social |
| Invitations de membres, rôles système et personnalisés, permissions | Portées `TEAM` / `DEPARTMENT` appliquées (lot 2.5 ; en attendant elles retombent sur `OWN`) |
| **Contacts, entreprises, étiquettes** : CRUD, recherche, filtres, pagination, propriétaire, audit | Import/export CSV, fusion de doublons, champs personnalisés, leads |
| Isolation tenant : contexte serveur, filtres, Row Level Security, FK composites | Redis, files d'attente, workers, temps réel, stockage de fichiers |
| Journal d'audit en ajout seul | Console Super Admin, abonnements, quotas |
| Limitation de débit (en mémoire, une seule instance) | Sauvegardes de la base, supervision, alertes |
| Documentation OpenAPI | Docker (non livré : inutile, la plateforme construit depuis le dépôt) ; CI écrite mais jamais exécutée |
| **Déploiement réel** : Render + Neon + domaine Hostinger, vérifié | Interface d'administration |

## Prérequis

- Node.js ≥ 22 (développé avec 24) et npm.
- **Ni Docker ni PostgreSQL à installer** : un vrai PostgreSQL est embarqué via npm.

## Démarrage local

```bash
npm install          # dépendances + binaires PostgreSQL
npm run setup        # crée .env avec des secrets aléatoires (jamais versionné)
npm run db:generate  # client Prisma
npm run db:start     # terminal 1 : PostgreSQL local + migrations (laisser ouvert)
npm run db:seed      # optionnel : compte de démonstration, mot de passe affiché une fois
npm run dev:api      # terminal 2 : API en mode rechargement
npm run dev:web      # terminal 3 : interface web
```

- API : <http://localhost:3000/api/v1>
- Documentation interactive : <http://localhost:3000/api/docs>
- Santé : <http://localhost:3000/api/v1/health/ready>
- Interface web : <http://localhost:5173> — son proxy `/api` pointe vers l'API en ligne
  (`api-crm.timestradinginter.com`), donc pas besoin de démarrer l'API locale pour l'utiliser. Voir
  [06-interface-web](docs/architecture/06-interface-web.md).

Pour tester les parcours par e-mail en local, le lien (et son jeton) apparaît dans la console de
l'API sur une ligne `[E-MAIL NON ENVOYÉ — pilote "log"]`. Trois pilotes existent pour l'envoi réel
(voir `MAIL_*` dans [.env.example](.env.example)) : `smtp` (serveur SMTP classique) et `http` (API
HTTPS Brevo/Resend). **Sur une instance Free de Render, `smtp` ne peut pas fonctionner** : les ports
25, 465 et 587 sont filtrés — utilisez `http`.

## Commandes

| Commande | Rôle |
| --- | --- |
| `npm test` | Suite complète sur un PostgreSQL jetable (`npm test -- rbac` pour filtrer) |
| `npm run lint` · `npm run typecheck` · `npm run format` | Qualité |
| `npm run build` · `npm run start:api` | Compilation puis exécution de l'API compilée |
| `npm run build:web` · `npm run typecheck:web` | Vérification et bundle de l'interface dans `apps/web/dist` |
| `npm run db:start` · `npm run db:stop` | Base de développement (données dans `.data/`) |
| `npm run db:migrate` | Applique les migrations et synchronise le catalogue de permissions (base déjà démarrée) |
| `npm run db:seed` | Compte de démonstration (refusé en production) |

## Déploiement

En ligne avec une séparation nette des rôles — Render + Neon (PostgreSQL 16) + DNS Hostinger :

| URL | Rôle |
| --- | --- |
| <https://crm.timestradinginter.com> | interface **Louk's CRM** (Render Static Site) |
| <https://api-crm.timestradinginter.com/api/v1/health/ready> | sonde de santé de l'API |
| <https://api-crm.timestradinginter.com/api/v1/health/live> | vivacité de l'API |
| <https://api-crm.timestradinginter.com/api/docs> | documentation OpenAPI interactive |

```bash
curl https://api-crm.timestradinginter.com/api/v1/health/ready
# {"status":"ok","checks":{"database":"ok"}}
```

Le routage de l'interface utilise le fragment (`/#/verify-email?token=…`) : le navigateur ne
demande que la racine du site, ce qui évite les `404` des routes côté client sur un hébergeur
statique sans règle de réécriture.

La configuration est décrite dans [render.yaml](render.yaml) ; les variables d'environnement
attendues sont listées dans [.env.production.example](.env.production.example).

**Deux URL de connexion, c'est volontaire** — ne les confondez pas :

| Variable | Rôle | Usage |
| --- | --- | --- |
| `DATABASE_URL` | `crm_app` — sans `BYPASSRLS` | exécution ; la RLS est réellement appliquée |
| `DATABASE_MIGRATION_URL` | propriétaire de la base | `prisma migrate deploy`, synchronisation des permissions |

L'API **refuse de démarrer** si `DATABASE_URL` pointe sur un rôle superutilisateur ou `BYPASSRLS` :
c'est un garde-fou, pas une panne. Détail de la mise en place, procédure sur une base neuve et limites
connues : [rapport de phase 1b](docs/rapports/phase-1b-deploiement.md).

## Tests

113 tests, dont la majorité s'exécutent contre l'API réelle et un vrai PostgreSQL :

| Suite | Sujet |
| --- | --- |
| `tenant-isolation` | Un utilisateur de l'organisation A ne peut ni lire ni modifier B par l'API |
| `rls` | Même garantie en SQL brut, sans aucun filtre applicatif |
| `rbac` | Permissions, anti-élévation de privilèges, invitations, audit |
| `access-policy` | Aucune route sans politique d'accès ; socle HTTP |
| `auth` · `rate-limit` | Authentification, sessions, force brute |
| `architecture` · `permission-catalog` | Règles d'architecture et logique pure |

## Structure

```text
apps/api/        API NestJS (src/ : config, database, common, modules ; test/)
apps/web/        Interface React + Vite (src/ : lib, components, pages, styles)
prisma/          schéma, migrations SQL (dont RLS), synchronisation des permissions
scripts/         base locale embarquée, lanceur de tests, génération du .env
docs/            architecture, décisions (ADR), rapports de phase
```

## Documentation

| Document | Contenu |
| --- | --- |
| [01 — Analyse](docs/architecture/01-analyse-cahier-des-charges.md) | Lecture du cahier, ambiguïtés, décisions à confirmer, risques |
| [02 — Architecture](docs/architecture/02-architecture.md) | Vue d'ensemble, pile, cycle d'une requête, hébergement sans VPS |
| [03 — Modèle de données](docs/architecture/03-modele-de-donnees-erd.md) | ERD de la phase 1 (exact) et cible par domaine |
| [04 — Multi-tenant et RBAC](docs/architecture/04-multi-tenant-et-rbac.md) | Barrières d'isolation, policies, permissions, authentification |
| [05 — Plan](docs/architecture/05-plan-implementation.md) | Phases, Definition of Done, décisions attendues |
| [06 — Interface web](docs/architecture/06-interface-web.md) | Identité visuelle, stack, écrans, développement, ce qui reste |
| [Décisions](docs/decisions/) | ADR-0001 à 0007 (hébergement, isolation, authentification, e-mails) |
| [Rapport de phase 1a](docs/rapports/phase-1a-fondations.md) | Socle technique : ce qui a été fait, vérifié, et ce qui reste |
| [Rapport de phase 1b](docs/rapports/phase-1b-deploiement.md) | Premier déploiement : topologie, DNS, RLS en production, e-mails, reste à faire |

## Règles pour contribuer

1. Une route sans `@Public()`, `@UserScoped()` ou `@RequirePermissions()` est refusée et casse les tests.
2. Un module métier n'accède à la base que par `TenantDb.run(...)`, et filtre toujours sur `organizationId`.
3. Toute nouvelle table d'organisation suit la
   [procédure](docs/architecture/03-modele-de-donnees-erd.md#4-procédure-pour-ajouter-une-table-tenant)
   (RLS forcée, privilèges, FK composites, tests d'accès croisé).
4. Aucun secret dans Git ; aucune fonctionnalité affichée sans backend réel.
