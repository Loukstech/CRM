# Rapport d'implémentation — Phase 1a : fondations

- **Date :** 2026-11-13
- **Périmètre :** première mission du cahier des charges (§16)
- **Environnement de vérification :** Windows 10, Node.js 24.14, PostgreSQL 18 embarqué. Rien n'a été vérifié sur Linux, macOS ou un hébergement distant.

## 1. Résultat des vérifications

Exécutées en fin de phase, sur le code livré :

| Vérification | Commande | Résultat |
| --- | --- | --- |
| Formatage | `npm run format:check` | conforme |
| Lint (règles typées) | `npm run lint` | 0 erreur |
| Typage strict | `npm run typecheck` | 0 erreur |
| Compilation | `npm run build` | réussie |
| Tests | `npm test` | **113 réussis sur 113**, 8 suites, environ 35 s |
| Démarrage réel | API compilée + base de développement | sondes de santé, inscription, rôles et Swagger (24 chemins) vérifiés avec `curl` |

## 2. Réponse point par point à la mission (§16)

| # | Demande | État | Où |
| --- | --- | --- | --- |
| 1 | Inspecter le dépôt, proposer l'arborescence | Fait | [02-architecture](../architecture/02-architecture.md) §3 |
| 2 | Diagrammes d'architecture et ERD | Fait (diagrammes Mermaid, **non contrôlés dans un moteur de rendu**) | Documents 02 et 03 |
| 3 | Modèle multi-tenant et règles RBAC | Fait et testé | [04](../architecture/04-multi-tenant-et-rbac.md) |
| 4 | Premier schéma Prisma cohérent | Fait pour la phase 1 (11 tables) ; le reste est documenté comme cible | [schema.prisma](../../prisma/schema.prisma) |
| 5 | Migrations initiales | Fait : `init` + `tenant_isolation` (RLS, privilèges, contraintes) | [migrations](../../prisma/migrations/) |
| 6 | Authentification, organisations, memberships | Fait et testé | `apps/api/src/modules` |
| 7 | Tests prouvant l'étanchéité entre organisations | Fait, à deux niveaux (API et SQL brut) | `tenant-isolation`, `rls` |
| 8 | Rapport et commandes de lancement | Ce document et le [README](../../README.md) | |

## 3. Ce qui fonctionne

24 chemins d'API sous `/api/v1` :

- **Authentification** — inscription (compte + organisation + rôles système), connexion,
  rafraîchissement à rotation, déconnexion, profil, changement d'organisation, vérification d'e-mail,
  mot de passe oublié et réinitialisation.
- **Organisations** — liste des siennes, création d'une organisation supplémentaire, lecture et
  modification de l'organisation active.
- **Membres et invitations** — liste paginée, changement de rôle ou de statut, retrait ; invitation
  par e-mail, révocation, acceptation avec un compte existant ou en créant son compte.
- **Rôles** — catalogue des permissions, rôles système immuables, rôles personnalisés.
- **Audit** — journal paginé et filtrable de l'organisation.
- **Santé** — sondes `live` et `ready`.

## 4. Ce qui est simulé ou absent (à ne pas présenter comme opérationnel)

| Élément | Réalité |
| --- | --- |
| Envoi d'e-mails | **Aucun e-mail n'est envoyé.** Le pilote `log` écrit le message et son lien dans la console. L'API refuse de démarrer en production avec ce pilote ; elle ne peut donc pas tourner en production tant qu'un connecteur réel n'est pas écrit |
| Limitation de débit | Compteurs en mémoire : correcte pour une seule instance, inefficace au-delà |
| Portées `OWN` / `TEAM` / `DEPARTMENT` | Stockées et validées, mais aucune donnée ne les utilise encore |
| Application web, mobile, workers, Redis, stockage de fichiers | Absents |
| MFA, OAuth social, console Super Admin, abonnements | Absents |
| Docker | Non livré (impossible à tester sur cette machine) |
| CI | Fichier `.github/workflows/ci.yml` écrit, **jamais exécuté** |
| Déploiement | Aucun |
| Sauvegardes, supervision, alertes | Absentes |

## 5. Écarts par rapport au cahier

| Écart | Justification |
| --- | --- |
| Schéma Prisma limité aux tables de la phase | Une table sans code ni test serait une promesse non tenue ; chaque module livre sa migration avec sa RLS |
| npm workspaces au lieu d'un outil non précisé | Aucun outil à installer ; réversible |
| Pas de Redis/BullMQ ni de Docker en phase 1 | Rien à mettre en file pour l'instant ; contrainte « sans VPS » ([ADR-0004](../decisions/ADR-0004-hebergement-sans-vps.md)) |
| Dossiers `web`, `mobile`, `worker`, `packages` non créés | Créés avec leur premier code réel |
| Tables ajoutées (`sessions`, `refresh_tokens`, `user_tokens`, `invitations`) | Nécessaires à la sécurité des sessions et à l'ajout de membres |

## 6. Problèmes rencontrés et résolus

| Problème | Résolution |
| --- | --- |
| NestJS 12 est publié en ESM | Configuration alignée sur le gabarit officiel (`module: nodenext`, Jest avec modules VM) |
| PostgreSQL refuse de démarrer en session administrateur Windows | Démarrage par `pg_ctl` |
| Base créée en WIN1252, caractères rejetés | UTF-8 et ICU imposés à l'initialisation |
| Prisma ne renseigne pas la cible d'une violation d'unicité composite | Détection par modèle ; un nom de rôle en double renvoyait un code d'erreur générique, corrigé et testé |
| Le validateur de pays acceptait `ZZ` | Codes réservés exclus, testé |

## 7. Dette technique et risques ouverts

| Sujet | Gravité | Action prévue |
| --- | --- | --- |
| `npm audit` : 3 alertes « high » (`deepmerge-ts`), toutes dans l'outil en ligne de commande Prisma 6, pas dans le code servi aux requêtes | Moyenne | Passage à Prisma 7 dans une tâche dédiée |
| 29 autres alertes (faibles ou modérées) dans les outils de développement (Jest, CLI NestJS) | Faible | Suivi lors des mises à jour |
| Tables d'identité sans RLS | Moyenne | Confinement par le code et test d'architecture ; à réévaluer avec la console éditeur |
| Deux requêtes SQL par appel pour revalider les droits | Faible | Cache court après mesure |
| Pas de purge des sessions et jetons expirés | Faible | Tâche planifiée en phase 7 |
| Le verrouillage de compte peut être provoqué par un tiers | Faible | Notification par e-mail quand l'envoi réel existera |
| Version embarquée de PostgreSQL ≠ version de production future | Faible | Faire tourner la CI contre la version de production |
| Aucune revue de sécurité indépendante | À traiter | Phase 11, et avant toute donnée réelle |

## 8. État du dépôt Git

Dépôt initialisé (`git init`), **aucun commit créé** : le premier commit est laissé à votre
initiative. `.env` et `.data/` sont ignorés ; aucun secret n'est présent dans les fichiers suivis.

## 9. Suite proposée

Phase 1b (voir le [plan](../architecture/05-plan-implementation.md)), après votre validation et vos
réponses aux décisions A1 (hébergeur), A6 (jeton côté web), A10 (fournisseur d'e-mails) et A7 (MFA).
