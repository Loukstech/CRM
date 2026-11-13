# 04 — Isolation multi-tenant et RBAC

Tout ce qui est décrit ici est **implémenté et couvert par des tests** (références en fin de section),
sauf les paragraphes explicitement marqués 🟡.

## 1. Modèle d'isolation

Base partagée, schéma partagé, colonne `organization_id` (cahier §6.1). Quatre barrières
indépendantes ; chacune suffit à bloquer un accès croisé si une autre est défaillante.

| # | Barrière | Où | Ce qu'elle bloque |
| --- | --- | --- | --- |
| 1 | **Contexte validé côté serveur** | `AccessGuard`, `MembershipAccessService` | Un `organization_id` choisi par le client |
| 2 | **Filtre applicatif explicite** | Chaque requête des services (`where: { organizationId }`) | L'accès à une ressource d'un autre tenant (réponse 404) |
| 3 | **Row Level Security** | PostgreSQL, rôle `crm_app` | Un filtre oublié par un développeur |
| 4 | **Clés étrangères composites** | Schéma | Le rattachement d'une entité à une entité d'un autre tenant, même par un superutilisateur |

### 1.1 D'où vient l'organisation active

Jamais du corps, de l'URL ou d'un en-tête d'une requête métier.

1. À la connexion, le serveur choisit une organisation dont l'utilisateur est **membre actif** et
   l'inscrit dans le jeton d'accès (revendication `org`) et dans la session.
2. À **chaque requête**, le garde relit en base : session non révoquée, compte actif, membership
   `ACTIVE` dans une organisation `ACTIVE`. Sinon le contexte tenant est vide et toute route métier
   répond `403 NO_ACTIVE_ORGANIZATION`.
3. Pour changer d'organisation : `POST /auth/switch-organization`, qui vérifie l'appartenance avant
   d'émettre un nouveau jeton. La réponse est identique que l'organisation existe ou non.

Les deux seuls champs `organizationId` acceptés d'un client servent à **désigner** l'organisation à
activer (connexion, changement) ; un test d'architecture interdit d'en ajouter ailleurs.

### 1.2 Row Level Security

L'API se connecte avec `crm_app` : ni superutilisateur, ni `BYPASSRLS`, ni propriétaire des tables.
Elle **refuse de démarrer** si ce n'est pas le cas.

`TenantDb.run(scope, fn)` ouvre une transaction et y pose le contexte :

```sql
SELECT set_config('app.current_org_id',  $1, true),   -- true = portée transaction
       set_config('app.current_user_id', $2, true),
       set_config('app.invitation_token_hash', $3, true);
```

La portée « transaction » est essentielle : le contexte disparaît au `COMMIT`/`ROLLBACK`, il ne peut
donc pas fuir vers la requête suivante qui réutilise la même connexion du pool. C'est aussi ce qui
rend le mécanisme compatible avec un pooler en mode transaction (hébergement managé).

Policies (migration [tenant_isolation](../../prisma/migrations/20261113000100_tenant_isolation/migration.sql)) :

| Table | Lecture | Écriture |
| --- | --- | --- |
| `roles`, `role_permissions` | `organization_id = contexte` | idem |
| `memberships` | organisation du contexte ; **ou**, sans organisation dans le contexte, les memberships de l'utilisateur | organisation du contexte |
| `organizations` | organisation du contexte ; **ou**, sans organisation, celles dont l'utilisateur est membre | `id = contexte` |
| `invitations` | organisation du contexte ; **ou**, sans organisation, la seule ligne dont le hash du jeton est présenté | organisation du contexte |
| `audit_logs` | organisation du contexte | insertion pour le contexte ou hors tenant ; ni UPDATE ni DELETE (privilège absent) |

Les exceptions « sans organisation dans le contexte » servent à la connexion, au sélecteur
d'organisation et à l'acceptation d'une invitation. Elles ne donnent accès à **aucune donnée
interne** d'une organisation (rôles, audit, autres membres).

Sans contexte, toutes les tables tenant renvoient zéro ligne (échec fermé).

### 1.3 Limites connues

- Les tables d'identité (`users`, `sessions`, `refresh_tokens`, `user_tokens`) sont globales et
  **sans RLS** : un utilisateur appartient à plusieurs organisations. Leur accès est confiné par le
  code (module `auth`) et par un test d'architecture, pas par la base.
- La RLS protège contre les erreurs de l'application, pas contre une application compromise capable
  de poser elle-même un autre contexte.
- 🟡 Accès de support de l'éditeur (§2.1) : aucun mécanisme n'existe ; aucun compte ne peut
  aujourd'hui lire plusieurs organisations.

## 2. RBAC

### 2.1 Modèle

```text
membership ──► role ──► role_permissions (permission_key, scope)
```

- **Permissions** : catalogue global défini dans le code
  ([permission-catalog.ts](../../apps/api/src/modules/permissions/permission-catalog.ts)),
  synchronisé en base par le rôle de migration. `crm_app` ne peut que le lire.
- **Rôles** : propres à chaque organisation. Trois rôles système créés automatiquement et non
  modifiables, plus des rôles personnalisés.
- **Portée** : `OWN < TEAM < DEPARTMENT < ORGANIZATION`, stockée par couple rôle/permission.

Permissions de la phase 1 (toutes de portée `ORGANIZATION`, car administratives) :

| Permission | owner | admin | member |
| --- | :-: | :-: | :-: |
| `organization.view` | ✓ | ✓ | ✓ |
| `organization.update` | ✓ | ✓ | |
| `members.view` | ✓ | ✓ | ✓ |
| `members.invite` | ✓ | ✓ | |
| `members.update` | ✓ | ✓ | |
| `members.remove` | ✓ | ✓ | |
| `roles.view` | ✓ | ✓ | ✓ |
| `roles.manage` | ✓ | ✓ | |
| `audit.view` | ✓ | ✓ | |

`owner` et `admin` ont les mêmes permissions ; ce qui les distingue est la règle « propriétaire »
ci-dessous. Chaque module métier ajoutera ses permissions au catalogue dans sa phase.

### 2.2 Refus par défaut

Chaque route déclare exactement une politique ; une route qui n'en déclare aucune est refusée (403)
et fait échouer la suite de tests.

| Décorateur | Signification |
| --- | --- |
| `@Public()` | Sans authentification (inscription, connexion, santé…) |
| `@UserScoped()` | Authentifié, hors organisation : uniquement les données de l'utilisateur lui-même |
| `@RequirePermissions('x.y', …)` | Organisation active **et** toutes les permissions listées |

### 2.3 Règles anti-élévation de privilèges

Détenir `roles.manage` ou `members.update` ne suffit pas :

1. **Sous-ensemble.** On ne peut créer, modifier, supprimer ou attribuer un rôle que si l'on détient
   soi-même chacune de ses permissions, avec une portée au moins égale.
2. **Propriétaire.** Seul un propriétaire peut attribuer le rôle `owner` ou modifier/retirer un
   propriétaire.
3. **Pas d'auto-modification.** Nul ne peut changer son propre rôle, se suspendre ou se retirer.
4. **Dernier propriétaire.** Une organisation garde toujours au moins un propriétaire actif.
   L'invariant est vérifié dans la transaction, après verrouillage de la ligne de l'organisation,
   pour résister aux modifications concurrentes.
5. **Rôles système immuables**, et un rôle utilisé (membres ou invitations en attente) ne peut pas
   être supprimé.

### 2.4 Portées `OWN` / `TEAM` / `DEPARTMENT` 🟡

Le stockage, la validation et la règle de sous-ensemble gèrent déjà les portées. Leur **application
aux données** (filtrer une liste de contacts sur « les miens » ou « ceux de mon équipe ») arrive en
phase 2 avec les premières ressources à propriétaire et les tables `teams` / `departments`. Aucune
permission à portée variable n'existe aujourd'hui.

## 3. Authentification

| Élément | Choix |
| --- | --- |
| Mot de passe | Argon2id (19 MiB, 2 itérations) ; 12 à 128 caractères, sans règle de composition |
| Jeton d'accès | JWT HS256, 15 min, émetteur et audience vérifiés, algorithme imposé |
| Jeton de rafraîchissement | Opaque 256 bits, stocké haché, **usage unique** ; un rejeu révoque toute la session |
| Session | Durée absolue 30 jours, révocable ; vérifiée à chaque requête |
| Force brute | 5 échecs → verrouillage 15 min ; limitation de débit par IP sur les routes sensibles |
| Énumération | Réponses identiques pour connexion et mot de passe oublié ; vérification factice du hash si le compte n'existe pas |
| Jetons e-mail | Usage unique, expirants (48 h vérification, 1 h réinitialisation, 7 j invitation), stockés hachés |
| Réinitialisation | Révoque toutes les sessions de l'utilisateur |

Non implémenté 🟡 : MFA/TOTP, OAuth social, envoi réel d'e-mails, cookies `httpOnly` pour le web,
notification à l'utilisateur en cas de verrouillage, limitation de débit partagée entre instances.

## 4. Journal d'audit

Écrit **dans la même transaction** que l'action : pas d'action sans trace, pas de trace sans action.
Chaque entrée porte l'acteur, l'adresse IP, l'agent utilisateur et l'identifiant de corrélation. Les
événements d'identité (connexions, échecs, verrouillages, réinitialisations) sont enregistrés hors
tenant et ne sont lisibles par aucune organisation.

## 5. Preuves par les tests

| Fichier | Ce qu'il prouve |
| --- | --- |
| [tenant-isolation.e2e-spec.ts](../../apps/api/test/tenant-isolation.e2e-spec.ts) | Avec un compte légitime de A : aucune lecture ni écriture sur B par l'API, jeton visant B sans effet, utilisateur multi-organisation cloisonné, perte d'accès immédiate |
| [rls.e2e-spec.ts](../../apps/api/test/rls.e2e-spec.ts) | En SQL brut avec `crm_app`, sans aucun filtre : la base seule isole ; toute table tenant a une RLS forcée ; audit en ajout seul ; FK composites |
| [rbac.e2e-spec.ts](../../apps/api/test/rbac.e2e-spec.ts) | Permissions par route, anti-élévation, propriétaire, dernier propriétaire (y compris en concurrence), invitations |
| [access-policy.e2e-spec.ts](../../apps/api/test/access-policy.e2e-spec.ts) | Aucune route sans politique ; listes exactes des routes publiques et hors organisation |
| [auth.e2e-spec.ts](../../apps/api/test/auth.e2e-spec.ts) | Inscription, connexion, verrouillage, rotation et rejeu des jetons, vérification d'e-mail, réinitialisation |
| [architecture.spec.ts](../../apps/api/src/architecture.spec.ts) | Client Prisma brut confiné, pas d'`organizationId` dans les DTO, pas de SQL concaténé |
