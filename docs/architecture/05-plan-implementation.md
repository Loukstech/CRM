# 05 — Plan d'implémentation

Ordre imposé par le §14.2 du cahier. Chaque phase suit le cycle du §14.4 : décrire → implémenter un
périmètre limité → lint, typage, tests → documenter → résumer → **attendre la validation** avant la
phase structurante suivante.

## Definition of Done d'un module (rappel du §14.5, précisé)

Un module n'est déclaré terminé que si :

- [ ] migration avec RLS forcée, privilèges explicites et FK composites ;
- [ ] permissions ajoutées au catalogue et **toutes** utilisées par au moins une route ;
- [ ] chaque route porte une politique d'accès ; filtres `organizationId` explicites ;
- [ ] tests : CRUD, validation, permissions par rôle et portée, **accès croisé entre deux tenants** ;
- [ ] écritures sensibles tracées dans l'audit ;
- [ ] interface web avec états chargement / vide / erreur (à partir de la phase 1b) ;
- [ ] documentation et rapport de phase à jour, limites signalées.

## État d'avancement

| Phase | Périmètre | État |
| --- | --- | --- |
| 0 | Analyse, architecture, ERD, décisions | ✅ fait (documents 01 à 05, ADR) |
| 1a | Monorepo, schéma, migrations, auth, organisations, membres, RBAC, audit, tests d'isolation | ✅ fait — [rapport](../rapports/phase-1a-fondations.md) |
| 1b | Finition des fondations (voir ci-dessous) | ⏳ à valider |
| 2 → 11 | Modules métier, mobile, durcissement | 🟡 non commencé |

## Phase 1b — Finition des fondations (proposée)

À faire avant tout module métier, car chaque point conditionne les suivants.

| # | Tâche | Dépend d'une décision |
| --- | --- | --- |
| 1 | Application web de base : connexion, inscription, sélecteur d'organisation, membres, rôles, invitations, journal d'audit ; design system (thème clair/sombre), i18n français | A6 (transport du jeton côté web) |
| 2 | Paquets partagés `packages/` : types, validateurs, client d'API généré depuis OpenAPI | — |
| 3 | Connecteur d'e-mails réel + gabarits | A10 (fournisseur) |
| 4 | MFA TOTP avec codes de secours | A7 |
| 5 | Dépôt distant + exécution réelle de la CI (le fichier existe, il n'a jamais tourné) | Vous : création du dépôt |
| 6 | Premier déploiement sur l'hébergement managé retenu | A1 (hébergeur) |
| 7 | Gestion du profil : changement de mot de passe, liste et révocation de ses sessions, quitter une organisation | — |

## Phases suivantes

Durées indicatives du cahier (§11), pour une équipe ; à réévaluer après la phase 2.

| Phase | Périmètre | Points d'attention | Version |
| --- | --- | --- | --- |
| 2 | Équipes, départements, **portées RBAC appliquées** ; contacts, entreprises, tags, notes, champs personnalisés, import/export CSV-XLSX, doublons et fusion, leads et conversion ; stockage de fichiers | Premier module à propriétaire : c'est ici que `OWN`/`TEAM`/`DEPARTMENT` deviennent réels. Décision A12 (unicité e-mail) | Alpha |
| 3 | Pipelines, étapes, opportunités, historique, prévisions ; activités, tâches, calendrier interne ; dashboard de base | Montants en `NUMERIC` + devise ; KPI calculés côté serveur dans le périmètre d'accès | Alpha |
| 4 | Produits, devis, factures, paiements partiels | Transactions, numérotation sans trou, `Idempotency-Key`, journal non destructif. Règles fiscales par pays à fournir (§15) | Beta |
| 5 | Marketing : segments, modèles, campagnes e-mail, consentements, désinscription | Exclusion automatique des opposés ; ouvertures présentées comme approximatives | Beta |
| 6 | Support : tickets, SLA, macros, base de connaissances | Messages publics / notes internes strictement séparés | Beta |
| 6b | Abonnements SaaS, entitlements, quotas ; console Super Admin avec accès de support justifié et journalisé | Prestataire de paiement interchangeable ; décision A8 | Beta |
| 7 | Workers et automatisations (déclencheur → conditions → actions) | Choix de la file (A11) contraint par l'hébergement sans VPS ; idempotence, anti-boucles, quotas | Beta |
| 8 | Assistant IA et connecteurs (calendriers, WhatsApp, SMS, Lead Ads) | Outils métier soumis aux permissions, jamais de SQL libre ; disponibilité des fournisseurs par pays | 1.0 |
| 9 | RH opérationnelles, analytics avancés | Permissions renforcées sur les données RH | 1.0 |
| 10 | Application mobile et synchronisation hors ligne | Périmètre hors ligne à définir (§15) ; détection de conflits | 1.0 |
| 11 | Durcissement : audit de sécurité, performance, supervision, sauvegardes et restauration testée, documentation utilisateur | RPO/RTO à définir (§15) | 1.0 |

## Décisions attendues de votre part

Reprises de l'[analyse](01-analyse-cahier-des-charges.md) §3 ; les quatre premières conditionnent la phase 1b.

1. **A1 — Hébergeur** (API Node.js + PostgreSQL géré), sans VPS.
2. **A6 — Jeton de rafraîchissement côté web** : cookie `httpOnly` (recommandé) ou stockage applicatif.
3. **A10 — Fournisseur d'e-mails.**
4. **A7 — Priorité du MFA** : phase 1b (recommandé) ou plus tard.
5. A4 — Rôles par défaut supplémentaires (commercial, support, lecture seule…).
6. A8 — Calendrier de la console Super Admin.
