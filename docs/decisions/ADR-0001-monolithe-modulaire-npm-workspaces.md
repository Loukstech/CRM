# ADR-0001 — Monolithe modulaire NestJS dans un monorepo npm workspaces

- **Statut :** accepté (2026-11-13)
- **Contexte :** cahier §5.2 (monolithe modulaire), §5.4 (monorepo). Machine de développement sans pnpm ni Docker.

## Décision

- Un seul déployable NestJS organisé par domaines métier.
- Monorepo en **workspaces npm** : aucun outil supplémentaire à installer.
- Format de module **CommonJS** avec `module: nodenext`, conformément au gabarit TypeScript par
  défaut de NestJS 12 (dont les paquets sont publiés en ESM et chargés nativement par Node ≥ 22).
- Un dossier (`apps/web`, `packages/*`…) n'est créé que lorsqu'il contient du code réel.

## Conséquences

- Jest doit être lancé avec `--experimental-vm-modules` (géré par `scripts/test-with-db.mjs`).
- Passer à pnpm ou à un outil de build de monorepo reste possible sans toucher au code applicatif.
- Prisma est fixé en version 6 ; la version 7 sera adoptée dans une tâche dédiée.
