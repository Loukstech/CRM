# CRM SaaS — plateforme multi-tenant

Monorepo de la plateforme CRM décrite dans le
[cahier des charges](cahier_des_charges_CRM_SaaS.md).

**État : phase 1a terminée — socle technique.** L'API gère l'authentification, les organisations,
les membres, les rôles et l'audit, avec une isolation multi-tenant testée. **Aucun module CRM
(contacts, ventes, facturation…) n'existe encore**, ni application web, ni application mobile.

## Ce qui fonctionne / ce qui n'existe pas

| Fonctionne (implémenté et testé) | N'existe pas encore |
| --- | --- |
| Inscription, connexion, déconnexion, rotation des jetons | Application web et mobile |
| Vérification d'e-mail et réinitialisation du mot de passe (jetons) | **Envoi réel d'e-mails** : le pilote `log` écrit le message dans la console et n'envoie rien |
| Organisations, multi-appartenance, changement d'organisation active | MFA, OAuth social |
| Invitations de membres, rôles système et personnalisés, permissions | Portées `OWN` / `TEAM` / `DEPARTMENT` appliquées à des données (phase 2) |
| Isolation tenant : contexte serveur, filtres, Row Level Security, FK composites | Redis, files d'attente, workers, temps réel, stockage de fichiers |
| Journal d'audit en ajout seul | Console Super Admin, abonnements, quotas |
| Limitation de débit (en mémoire, une seule instance) | Déploiement : aucun n'a été fait ni testé |
| Documentation OpenAPI | Docker (non livré : non testable ici) ; CI écrite mais jamais exécutée |

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
```

- API : <http://localhost:3000/api/v1>
- Documentation interactive : <http://localhost:3000/api/docs>
- Santé : <http://localhost:3000/api/v1/health/ready>

Pour tester les parcours par e-mail en local, le lien (et son jeton) apparaît dans la console de
l'API sur une ligne `[E-MAIL NON ENVOYÉ — pilote "log"]`.

## Commandes

| Commande | Rôle |
| --- | --- |
| `npm test` | Suite complète sur un PostgreSQL jetable (`npm test -- rbac` pour filtrer) |
| `npm run lint` · `npm run typecheck` · `npm run format` | Qualité |
| `npm run build` · `npm run start:api` | Compilation puis exécution de l'API compilée |
| `npm run db:start` · `npm run db:stop` | Base de développement (données dans `.data/`) |
| `npm run db:migrate` | Applique les migrations et synchronise le catalogue de permissions (base déjà démarrée) |
| `npm run db:seed` | Compte de démonstration (refusé en production) |

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
| [Décisions](docs/decisions/) | ADR-0001 à 0005 |
| [Rapport de phase 1a](docs/rapports/phase-1a-fondations.md) | Ce qui a été fait, vérifié, et ce qui reste |

## Règles pour contribuer

1. Une route sans `@Public()`, `@UserScoped()` ou `@RequirePermissions()` est refusée et casse les tests.
2. Un module métier n'accède à la base que par `TenantDb.run(...)`, et filtre toujours sur `organizationId`.
3. Toute nouvelle table d'organisation suit la
   [procédure](docs/architecture/03-modele-de-donnees-erd.md#4-procédure-pour-ajouter-une-table-tenant)
   (RLS forcée, privilèges, FK composites, tests d'accès croisé).
4. Aucun secret dans Git ; aucune fonctionnalité affichée sans backend réel.
