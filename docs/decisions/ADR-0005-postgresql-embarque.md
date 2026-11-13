# ADR-0005 — PostgreSQL embarqué pour le développement et les tests

- **Statut :** accepté (2026-11-13)
- **Contexte :** ni Docker ni PostgreSQL sur la machine de développement. Les tests d'isolation
  n'ont de valeur que sur un **vrai** PostgreSQL (RLS, rôles, clés étrangères).

## Décision

Utiliser les binaires officiels PostgreSQL distribués par le paquet npm `embedded-postgres`
(PostgreSQL 18), pilotés par [scripts/lib/embedded-db.mjs](../../scripts/lib/embedded-db.mjs) :

- `npm run db:start` : cluster persistant dans `.data/postgres`, migrations appliquées ;
- `npm test` : cluster jetable dans le dossier temporaire, détruit à la fin.

Ce n'est ni un simulateur ni une base en mémoire : c'est le serveur PostgreSQL, lancé localement.

## Détails qui ont compté

- **Session administrateur Windows :** `postgres.exe` refuse de démarrer avec des droits
  d'administration. Le script passe par `pg_ctl`, qui se relance avec un jeton restreint.
- **Encodage :** sous Windows, `initdb` choisit WIN1252 par défaut. Le script impose UTF-8 et les
  collations ICU ; sans cela, les caractères non latins étaient rejetés.

## Limites

- Réservé au développement et aux tests ; jamais en production.
- La version embarquée est une préversion (18.x bêta) du paquet npm : en cas de différence de
  comportement avec la base de production, c'est celle-ci qui fait foi. La CI devra à terme tourner
  aussi contre la version exacte de production.
- Les tests occupent le port 54331 et le développement le port 54329.
