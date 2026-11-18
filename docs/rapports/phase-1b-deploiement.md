# Rapport d'implémentation — Phase 1b : premier déploiement

- **Date :** 2026-11-13
- **Périmètre :** mettre l'API en ligne sur un domaine réel, avec une base gérée et une chaîne
  d'e-mails transactionnels.
- **Environnement de vérification :** Windows 10, Node.js 22.22, Render (Oregon), Neon
  (AWS us-west-2), DNS Hostinger. Tout ce qui suit a été vérifié **sur l'environnement distant**,
  pas en local.

> **Mise à jour 2026-11-18 :** `crm.` porte désormais l'interface web et `api-crm.` porte l'API.
> Les sections 1, 4, 8 et 9 décrivent l'état initial ; voir la [section 12](#12-mise-à-jour-du-2026-11-18--séparation-site--api) pour la topologie actuelle.

## 1. Résultat

L'API est accessible publiquement et répond correctement, sur un domaine propre :

| URL | Résultat |
| --- | --- |
| `https://crm.timestradinginter.com/api/v1/health/ready` | `200` → `{"status":"ok","checks":{"database":"ok"}}` |
| `https://crm.timestradinginter.com/api/v1/health/live` | `200` |
| `https://crm.timestradinginter.com/api/docs` | `200` (Swagger UI) |
| `https://crm.timestradinginter.com/api/docs-json` | `200`, **24 chemins** |
| `https://crm-api-eogq.onrender.com` | `200` (URL interne Render, secours) |

## 2. Topologie retenue

```text
Navigateur / curl
      │  HTTPS
      ▼
crm.timestradinginter.com          (CNAME Hostinger)
      │
      ▼
crm-api  ── Render, plan Free, région oregon, Node 22
      │
      ├── DATABASE_URL           ──► Neon PostgreSQL 16 (aws-us-west-2) · rôle crm_app  → RLS active
      └── DATABASE_MIGRATION_URL ──► même base                              · rôle neondb_owner
```

| Brique | Fournisseur | Identifiant | Remarque |
| --- | --- | --- | --- |
| API | Render | service `srv-dbrj68e7bikc73fu2sfg` | plan Free : 512 Mo, mise en veille après 15 min sans trafic |
| Base | Neon | projet `dark-bird-33272139`, base `neondb` | PostgreSQL 16, région `aws-us-west-2` |
| DNS | Hostinger | zone `timestradinginter.com` | piloté par l'API REST, pas à la main |
| Domaine | Render | `cdm-dbrj6a61egvs739kjsh0` | certificat TLS managé, renouvellement automatique |

**Pourquoi Neon et pas Render Postgres.** Un PostgreSQL Render avait d'abord été créé
(`dpg-dbrj5gt6e07s73bsohfg-a`). L'offre Free de Render **expire 30 jours après création** — inadapté
à un environnement de test qu'on veut garder. Neon offre une base gratuite sans échéance, avec un
point d'accès dans la même région que l'API.

## 3. Le point délicat : deux URL de connexion, pas une

C'est le cœur du déploiement, et c'est ce qui a fait échouer la première tentative.

`PrismaService.assertUnprivilegedRole()` refuse de démarrer si le rôle connecté est superutilisateur
ou possède `BYPASSRLS` — parce qu'un tel rôle rendrait la Row Level Security purement décorative.

Or sur Neon, l'utilisateur créé par défaut (`neondb_owner`) est propriétaire de la base. La première
mise en ligne s'est donc arrêtée net avec `update_failed` : le garde-fou faisait exactement son
travail.

La correction sépare les deux usages :

| Variable | Rôle | Privilèges | Utilisée par |
| --- | --- | --- | --- |
| `DATABASE_URL` | `crm_app` | `LOGIN NOSUPERUSER NOBYPASSRLS` | l'API à l'exécution |
| `DATABASE_MIGRATION_URL` | `neondb_owner` | propriétaire | `prisma migrate deploy`, `sync-permissions.ts` |

Le rôle `crm_app` est créé sans `LOGIN` par la migration `20261113000100_tenant_isolation`. Il faut
donc lui accorder `LOGIN`, un mot de passe et `CONNECT` sur la base — opération faite en SQL, une
seule fois, via `npx prisma db execute`. C'est un prérequis d'installation à rejouer sur toute
nouvelle base (voir §7).

Le journal de démarrage confirme le résultat :

```
Connecté à PostgreSQL avec le rôle « crm_app » (soumis à la RLS).
Nest application successfully started
```

## 4. DNS : un CNAME ne cohabite pas avec des enregistrements de messagerie

Le sous-domaine `crm` portait déjà une boîte e-mail : `MX`, `TXT` (SPF), trois `DKIM`,
`autodiscover.crm`, `autoconfig.crm` et `_dmarc.crm`. Un CNAME ne peut pas coexister avec ces
enregistrements au même nom — le CNAME a donc été refusé tant qu'ils étaient là.

Arbitrage retenu : **le web sur `crm.`**, la messagerie reste sur la racine du domaine. Les
enregistrements de messagerie de `crm` ont été supprimés (via l'API DNS Hostinger, en une passe
`PUT` puis `DELETE` filtré), puis le CNAME ajouté :

```text
crm.timestradinginter.com.  CNAME  crm-api-eogq.onrender.com.
```

Propagation vérifiée par `nslookup` : la chaîne aboutit à
`gcp-us-west-1-1.origin.onrender.com.cdn.cloudflare.net` (216.24.57.x), et HTTPS répond.

> À noter : l'API Render continue d'afficher le domaine en `unverified` alors que le trafic passe.
> C'est cosmétique — la vérification Render interroge un chemin qui n'existe pas sur une API pure.

## 5. Configuration de déploiement

`render.yaml` décrit le service, et a été réaligné sur la réalité après la bascule vers Neon
(commit `6734c19`) :

```yaml
buildCommand: npm install && npm run db:generate && npm run build
startCommand: npm run db:migrate && npm run start:api
healthCheckPath: /api/v1/health/ready
```

Trois détails qui ont chacun coûté une itération :

1. **`npm run db:generate` dans le build.** Sans lui, le client Prisma n'existe pas et la
   compilation échoue.
2. **`NPM_CONFIG_PRODUCTION=false`.** Avec `NODE_ENV=production`, npm ignore les
   `devDependencies` — or `nest build` a besoin de `@nestjs/cli` et `db:migrate` de `tsx`.
3. **`npm run db:migrate` au démarrage.** Les migrations sont idempotentes ; les appliquer à chaque
   démarrage évite un décalage entre le code déployé et le schéma.

## 6. Vérifications fonctionnelles sur l'environnement distant

Compte créé : `contact@timestradinginter.com`, organisation « Times Trading Inter »
(BJ, XOF, `Africa/Porto-Novo`). Connexion réussie, jetons émis.

| Endpoint | Résultat |
| --- | --- |
| `POST /api/v1/auth/register` | `201` — compte + organisation + rôles système créés |
| `POST /api/v1/auth/login` | `200` — `accessToken` + `refreshToken` |
| `GET /api/v1/auth/me` | `200` |
| `GET /api/v1/organizations` | `200` — « Times Trading Inter » |
| `GET /api/v1/organizations/current` | `200` |
| `GET /api/v1/members` | `200` — 1 membre `ACTIVE` |
| `GET /api/v1/roles` | `200` — rôles seedés, dont « Propriétaire » |
| `GET /api/v1/permissions` | `200` — catalogue complet |
| `GET /api/v1/audit-logs` | `200` — `organization.created` journalisé |

Cela valide de bout en bout la création de tenant, le seed des rôles, le contexte serveur et la RLS
sur une base distante.

## 7. Procédure d'installation sur une base neuve

À rejouer si la base est recréée (autre projet Neon, restauration, changement de fournisseur).

```bash
# 1. Migrations + policies, avec le rôle PROPRIÉTAIRE
DATABASE_MIGRATION_URL="postgresql://<owner>:<pass>@<host>/<db>?sslmode=require" \
  npx prisma migrate deploy

# 2. Donner vie au rôle applicatif (créé sans LOGIN par la migration)
npx prisma db execute --url "postgresql://<owner>:<pass>@<host>/<db>?sslmode=require" --stdin <<'SQL'
ALTER ROLE crm_app WITH LOGIN PASSWORD '<mot-de-passe-fort>';
GRANT CONNECT ON DATABASE <db> TO crm_app;
SQL
```

Puis renseigner côté plateforme :

```text
DATABASE_URL=postgresql://crm_app:<mot-de-passe>@<host>/<db>?sslmode=require&channel_binding=require
DATABASE_MIGRATION_URL=postgresql://<owner>:<pass>@<host>/<db>?sslmode=require
```

Le démarrage doit journaliser `Connecté à PostgreSQL avec le rôle « crm_app »`. S'il refuse de
démarrer, c'est que `DATABASE_URL` pointe encore sur le rôle propriétaire.

## 8. E-mails : SMTP est impossible sur Render Free

Les identifiants SMTP Hostinger ont été validés **en direct** (nodemailer, `smtp.hostinger.com:465`) :
authentification acceptée, message réellement remis. Mais depuis l'application, chaque envoi
échouait :

```
ERROR AuthService  Échec d'envoi de l'e-mail « email-verification » : Connection timeout
```

Cause, documentée par Render ([`render.com/docs/free`](https://render.com/docs/free)) :

> Free web services can't send outbound network traffic on ports `25`, `465`, or `587`, commonly
> used for SMTP.

Le port 25 est filtré pour **tous** les services, quel que soit le plan. Aucun réglage SMTP ne peut
donc fonctionner sur une instance Free.

Un troisième pilote a été ajouté derrière le port `Mailer` existant — voir
[ADR-0007](../decisions/ADR-0007-emails-via-api-http.md) :

| Pilote | Transport | Usage |
| --- | --- | --- |
| `log` | aucun | développement (interdit en production) |
| `smtp` | ports 25 / 465 / 587 | hébergeur qui ne filtre pas ces ports |
| `http` | HTTPS, port 443 | **Render Free**, Brevo ou Resend |

Le pilote `http` est désormais **actif et vérifié de bout en bout**. Mise en service :

1. Le domaine `timestradinginter.com` a été déclaré chez Brevo, qui a fourni quatre enregistrements
   DNS. Ils ont été posés dans la zone Hostinger par l'API REST :

   | Type | Nom | Valeur |
   | --- | --- | --- |
   | CNAME | `brevo1._domainkey` | `b1.timestradinginter-com.dkim.brevo.com` |
   | CNAME | `brevo2._domainkey` | `b2.timestradinginter-com.dkim.brevo.com` |
   | TXT | `@` | `brevo-code:…` |
   | TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com` |

   Le SPF existant a été **complété**, pas remplacé : `v=spf1 include:_spf.mail.hostinger.com
   include:spf.brevo.com ~all`. La messagerie Hostinger continue donc de fonctionner.

   > Piège rencontré : l'API DNS Hostinger **ajoute** les valeurs d'un enregistrement au lieu de les
   > remplacer (`overwrite: false`). Deux SPF ou deux DMARC au même nom rendent ces mécanismes
   > invalides — un SPF en double provoque un `permerror`. Il a fallu supprimer les TXT en doublon
   > (`DELETE` filtré sur `name` + `type`) puis les reposer proprement.

2. Brevo a confirmé les quatre enregistrements (`status: true`), puis l'authentification
   (`PUT /v3/senders/domains/{domaine}/authenticate` → `verified: true`, `authenticated: true`).

3. Côté Render : `MAIL_DRIVER=http`, `MAIL_HTTP_PROVIDER=brevo`, `MAIL_HTTP_API_KEY` renseignée —
   les trois en une seule opération, sinon la validation Zod empêche le démarrage.

Résultat, vérifié en production :

```
Render  : LOG HttpMailer  E-mail envoyé à=contact@timestradinginter.com gabarit=email-verification fournisseur=brevo
Brevo   : 19:33:51 requests  | Confirmez votre adresse e-mail
          19:33:53 delivered | Confirmez votre adresse e-mail
```

Un envoi de contrôle effectué **avant** l'authentification du domaine avait été refusé
(`Sending has been rejected because the sender you used contact@timestradinginter.com is not valid`) :
c'est bien l'authentification DNS qui débloque l'envoi, pas la clé API.

> **Limite subsistante :** le lien contenu dans l'e-mail pointe sur
> `https://crm.timestradinginter.com/verify-email?token=…`, qui répond **404** — il n'existe pas
> d'interface web. L'e-mail est bien remis, mais son lien n'est pas cliquable tant que le front n'est
> pas construit. `APP_WEB_URL` devra alors pointer sur le front, pas sur l'API.

## 9. Ce qui est simulé, absent ou fragile

| Élément | Réalité |
| --- | --- |
| **Envoi d'e-mails** | Opérationnel via Brevo, domaine authentifié, envoi réel confirmé (`delivered`) |
| **Liens des e-mails** | `APP_WEB_URL` pointe sur l'API : `/verify-email` et `/reset-password` renvoient **404**. Le lien est mort tant qu'il n'y a pas d'interface |
| **Application web** | Inexistante. Le dépôt ne contient que l'API |
| **Mise en veille** | Instance Free endormie après 15 min sans trafic → ~1 min de réveil à la première requête |
| **Plusieurs instances** | Impossible : la limitation de débit est en mémoire |
| **Sauvegardes** | Aucune. Neon Free n'inclut pas de restauration à un instant donné |
| **Quota d'e-mails** | Brevo gratuit : 300 messages par jour |
| **CI** | Écrite dans `.github/` mais jamais exécutée sur ce dépôt |
| **Secrets** | Les clés d'API ont circulé en clair pendant la mise en place : voir §10 |

## 10. Ce qui reste à faire

### Bloquant pour un usage réel

1. **Vérifier le compte `contact@timestradinginter.com`** — l'e-mail est remis, mais son lien
   renvoie 404 faute d'interface. En attendant le front, le compte fonctionne quand même
   (`login` n'exige pas `emailVerifiedAt`), et son mot de passe provisoire est à changer.
2. **Construire l'interface web**, puis pointer `APP_WEB_URL` et `CORS_ORIGINS` dessus : c'est ce
   qui rendra cliquables les liens de vérification et de réinitialisation.

### Hygiène et sécurité

3. **Tourner tous les secrets exposés pendant la mise en place** : clé API Render, clé API Neon,
   clé API Brevo, jetons Hostinger, `JWT_ACCESS_SECRET`, mots de passe `neondb_owner` et `crm_app`.
   Tant que ce n'est pas fait, considérez-les comme compromis.
4. **Supprimer le PostgreSQL Render inutilisé** `dpg-dbrj5gt6e07s73bsohfg-a` (expire le
   2026-12-13). Il ne sert plus à rien et consomme le quota d'une base Free par espace de travail.

### Avant d'ouvrir au public

5. `SWAGGER_ENABLED=1` aujourd'hui : à repasser à `0` le jour où l'API est exposée.
6. Passer sur un plan payant si la mise en veille gêne l'usage, et externaliser la limitation de
   débit (Redis) avant de lancer plusieurs instances.
7. Surveiller le quota Brevo (300 messages/jour) : au-delà, les envois sont refusés sans que
   l'application ne s'en aperçoive — `safeSend()` journalise l'échec sans le propager.

## 11. Journal des commits

| Commit | Contenu |
| --- | --- |
| `fba0055` | Envoi d'e-mails SMTP et configuration de déploiement Render |
| `c9c4433` | Correction du commentaire de branche dans `render.yaml` |
| `6734c19` | `render.yaml` aligné sur la réalité : Neon, pas Render Postgres ; Swagger activé |
| `a102b1e` | Pilote e-mail HTTP (Brevo/Resend) pour contourner le blocage SMTP de Render |
| `c8255ad` · `f67e971` | Documentation du déploiement (ce rapport, ADR-0006 et ADR-0007) |

Déploiements correspondants : `dep-dbrkq2oae00c73ds3en0` (`render.yaml`),
`dep-dbrkv2jl550s73coqk80` (mot de passe SMTP), `dep-dbrl48p7lnhs73dcl6dg` (pilote HTTP),
`dep-dbrlfa0n74is739757pg` (bascule vers Brevo) — tous terminés en `live`.

## 12. Mise à jour du 2026-11-18 — séparation site / API

Le choix retenu par le user est **`crm.` = interface, `api-crm.` = API**. Le domaine `crm.`
avait été créé à l'origine pour porter le site, pas l'API : la topologie décrite aux sections 1 et 4
ci-dessus n'est donc plus d'actualité.

| URL | Service Render | Identifiant |
| --- | --- | --- |
| `https://crm.timestradinginter.com` | Static Site `louks-crm-web` | `srv-dbus2tuk1f9s73b6oflg` |
| `https://api-crm.timestradinginter.com` | Web Service `crm-api` | `srv-dbrj68e7bikc73fu2sfg` |

Enregistrements DNS Hostinger (zone `timestradinginter.com`, pilotée par API) :

```text
crm       CNAME  louks-crm-web.onrender.com.
api-crm   CNAME  crm-api-eogq.onrender.com.
```

Les variables d'environnement de l'API ont été alignées :
`CORS_ORIGINS=https://crm.timestradinginter.com`,
`APP_WEB_URL=https://crm.timestradinginter.com`. Le site statique reçoit
`VITE_API_BASE_URL=https://api-crm.timestradinginter.com`. `SWAGGER_ENABLED` reste à `1` jusqu'à la
phase finale : aucun durcissement de sécurité n'est appliqué pendant le développement.

**Piège Render.** Le plan Free n'autorise que ** deux domaines personnalisés ** par espace de
travail. Tant que `crm.` était encore rattaché à l'API, l'ajout du même domaine au site statique
échouait avec `400 — a payment method is required to add more than 2 custom domains`. Il a fallu
supprimer l'ancien domaine de l'API (`cdm-dbrj6a61egvs739kjsh0`) avant de le déclarer sur le site.

**Piège SPA.** Un site statique Render ne réécrit pas les chemins inconnus vers `index.html` par
défaut : `/verify-email?token=…` renvoyait donc `404` alors même que la page existait dans le
bundle. Trois pistes ont été écartées après essai réel : un fichier `_redirects` (ignoré par Render),
le champ `serviceDetails.routes` de l'API de création (la règle `/* → /index.html` cassait la racine
et les assets, `/* → /` laissait la racine en 404), et un `404.html` généré à chaque build (Render ne
le sert pas pour les chemins inconnus). La solution retenue est de porter le routage côté client dans
le fragment : `HashRouter` côté front, et des liens d'e-mail construits en `APP_WEB_URL/#/route?token=…`
côté API. Le navigateur ne demande alors que `/`, que le site statique sait servir.

Le lien de vérification par e-mail est ainsi exploitable de bout en bout. Les secrets n'ont pas été
touchés lors de cette migration.
