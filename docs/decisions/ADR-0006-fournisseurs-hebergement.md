# ADR-0006 — Fournisseurs d'hébergement retenus

- **Statut :** accepté (2026-11-13) — clôt les points laissés ouverts par
  [ADR-0004](ADR-0004-hebergement-sans-vps.md)
- **Contexte :** ADR-0004 posait le principe « que des services managés, pas de VPS », sans choisir
  de fournisseur. Il fallait un environnement de test accessible publiquement, sur un domaine réel,
  sans engagement financier.

## Décision

| Brique | Retenu | Écarté, et pourquoi |
| --- | --- | --- |
| API Node.js | **Render**, plan Free, région `oregon` | Railway : essai expiré. Fly.io : demande une carte dès l'inscription |
| PostgreSQL | **Neon**, plan gratuit, `aws-us-west-2` | Render Postgres Free : **expire au bout de 30 jours**. Supabase : surdimensionné pour la phase 1 |
| DNS | **Hostinger**, via son API REST | Gestion manuelle : non reproductible, pas d'audit |
| E-mails | **API HTTP** (Brevo/Resend) | SMTP : bloqué sur Render Free, voir [ADR-0007](ADR-0007-emails-via-api-http.md) |

Contraintes que cette combinaison satisfait :

- **Processus Node.js permanent**, pas de modèle serverless — la limitation de débit en mémoire et
  les futurs workers l'exigent (point soulevé par ADR-0004).
- **Rôle applicatif sans `BYPASSRLS`** : Neon laisse créer un rôle en SQL et lui attribuer `LOGIN`,
  ce qui permet de tenir la garantie d'isolation. L'API refuse de démarrer sinon.
- **Deux URL de connexion** distinctes : `DATABASE_URL` (rôle `crm_app`) et
  `DATABASE_MIGRATION_URL` (propriétaire). Prisma le prévoyait déjà via `directUrl`.
- **Sondes de santé** consommées par la plateforme : `/api/v1/health/ready` sert de health check à
  Render.
- **Aucun secret dans le dépôt** : tout passe par les variables d'environnement de la plateforme.

## Ce que cette combinaison coûte

| Limite | Effet concret |
| --- | --- |
| Mise en veille après 15 min sans trafic | ~1 min de latence sur la première requête après une pause |
| 750 heures d'instance par mois | Suffisant pour une instance unique ; insuffisant pour deux |
| Filtrage des ports 25/465/587 | SMTP inutilisable → e-mails par API HTTP |
| Pas de sauvegarde sur Neon gratuit | Aucune restauration à un instant donné : à traiter avant des données réelles |
| Une seule instance | La limitation de débit en mémoire interdit de scaler horizontalement |

Ces limites sont acceptables pour un environnement de test et de démonstration. Elles ne le sont pas
pour une mise en production commerciale : le passage à des plans payants (Render Starter, Neon
Launch) et l'externalisation de la limitation de débit sont les deux préalables.

## Conséquence

Le déploiement est décrit et vérifié dans le
[rapport de phase 1b](../rapports/phase-1b-deploiement.md). Aucun fichier Docker n'est livré, et
aucun n'est nécessaire : la plateforme construit depuis le dépôt.
