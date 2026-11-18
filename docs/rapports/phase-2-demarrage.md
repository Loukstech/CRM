# Phase 2 — Démarrage : gratuité, périmètre et ordre de construction

> Rédigé le 2026-11-18, avant la première ligne de code de la phase 2.
> Répond à : « tout ça peut être géré gratuitement pour le début et les tests ? »

## 1. Ce qui est réellement gratuit (et ce que ça coûte en limites)

Aucun de ces plans n'est un plan d'essai : ils sont gratuits sans date d'expiration. Ils suffisent
pour construire et tester l'application, pas pour la vendre.

| Service | Plan | Ce qui est inclus | Limite qui nous touche vraiment |
| --- | --- | --- | --- |
| **Render** — API (`crm-api`) | Free (Oregon) | 1 service web Node, 512 Mo, 750 h/mois | Mise en veille après 15 min d'inactivité → ~40 s de réveil sur la première requête. Ports SMTP 25/465/587 bloqués (d'où Brevo en HTTPS). |
| **Render** — interface (`louks-crm-web`) | Free (statique) | Bande passante 100 Go/mois, TLS auto | Pas de réécriture d'URL : la SPA utilise un routage par fragment (`#/`). |
| **Render** — domaines | Free | 2 domaines personnalisés par espace de travail | `crm.` et `api-crm.` occupent déjà les deux places. Un troisième domaine imposerait un paiement. |
| **Neon** — PostgreSQL 16 | Free | 1 projet, 0,5 Go de stockage, 190 h de calcul/mois | Pas de restauration à un instant précis (PITR) : les sauvegardes sont des snapshots quotidiens sur 6 h d'historique. Le calcul se met en veille après 5 min d'inactivité (première requête ~1 s). |
| **Brevo** — e-mails | Free | 300 e-mails/jour, 9 000/mois | Plafond journalier strict. Suffisant pour les invitations et les tests, insuffisant pour une campagne marketing réelle. |
| **Hostinger** — DNS + boîte | Déjà payé | Zone DNS, boîte `contact@timestradinginter.com` | — |
| **GitHub** | Free | Dépôt privé, Actions 2 000 min/mois | La CI n'a jamais tourné : le workflow existe, le dépôt distant n'est pas encore branché. |

### Ce que la gratuité interdit (à assumer explicitement)

1. **Pas de workers ni de tâches planifiées.** Render Free n'a pas de service « background worker »
   gratuit, et un cron interne à l'API s'endormirait avec elle. Les phases qui en ont besoin
   (automatisations, campagnes programmées, relances) demanderont un plan payant ou un déclencheur
   externe (cron GitHub Actions appelant l'API). Décision reportée à la phase concernée.
2. **Pas de stockage de fichiers.** Pas d'espace disque persistant sur Render Free. Les pièces
   jointes (phase 2) et les PDF de factures (phase 4) iront vers un stockage objet externe
   (Cloudflare R2 : 10 Go gratuits) — décision non prise à ce jour.
3. **Pas de recherche plein texte performante.** Neon Free suffit pour `ILIKE` et les index `GIN`
   sur quelques milliers de contacts. Au-delà, il faudra `pg_trgm` (disponible) puis un moteur dédié.
4. **Un seul environnement.** Pas de préproduction gratuite : les tests se font sur la production,
   avec les données de test. Acceptable tant qu'il n'y a pas de client réel.
5. **Mise en veille.** La première requête après 15 min d'inactivité prend ~40 s. C'est le prix de
   la gratuité ; le frontend doit afficher un état de chargement patient plutôt qu'une erreur.

**Conclusion** : oui, la phase 2 se construit intégralement en gratuit. Les limites ci-dessus sont
des contraintes de test, pas des blocages.

## 2. Périmètre de la phase 2 — ce qui entre maintenant

Le plan initial (§11 du cahier) groupe beaucoup de choses. Découpage retenu, du plus structurant
au plus accessoire :

| Lot | Contenu | Pourquoi maintenant |
| --- | --- | --- |
| **2.1 — Contacts & entreprises** (ce lot) | Tables `companies`, `contacts`, `tags`, `contact_tags` ; CRUD complet ; recherche ; filtres ; propriétaire ; rattachement entreprise ; étiquettes ; pagination par curseur | C'est la matière première de tout le reste : pipelines, activités, devis, campagnes s'y rattachent. |
| **2.2 — Portées RBAC réelles** | `OWN` et `ORGANIZATION` effectives sur les contacts ; `TEAM`/`DEPARTMENT` en attente des équipes | Premier module à propriétaire : sans lui, les portées du catalogue restent décoratives. |
| **2.3 — Import / export CSV** | Export de la liste filtrée, import avec rapport d'erreurs ligne par ligne | Indispensable en usage réel : personne ne saisit 500 contacts à la main. |
| **2.4 — Doublons et fusion** | Détection sur e-mail/téléphone/nom, fusion assistée | Ne se conçoit qu'avec des données réelles (2.1 + 2.3). |
| **2.5 — Équipes et départements** | `teams`, `team_members`, `departments`, rattachement des memberships | Rend `TEAM`/`DEPARTMENT` réels. |
| **2.6 — Champs personnalisés** | `custom_field_definitions`, `custom_field_values` (polymorphe) | Demande une UI de configuration ; à faire quand les champs standard sont stables. |
| **2.7 — Leads et conversion** | `lead_sources`, `leads`, `lead_status_history`, conversion en contact | Recoupe fortement les contacts ; utile seulement avec un flux d'acquisition. |
| **2.8 — Stockage de fichiers** | `files` (métadonnées) + stockage objet | Bloqué par la décision R2/S3 (voir §1). |

### Ce que le lot 2.1 livre concrètement

**Base de données**

- `companies` : nom, domaine, secteur, téléphone, site web, adresse, ville, pays, notes,
  propriétaire (membership), auteur de création, `deleted_at`.
- `contacts` : prénom, nom, e-mail, téléphone, fonction, entreprise (FK composite), statut
  (`LEAD | PROSPECT | CUSTOMER | INACTIVE`), source, notes, propriétaire, auteur, `deleted_at`.
- `tags` : nom + couleur, unique par organisation.
- `contact_tags` : jointure contact ↔ tag, FK composites.
- RLS `ENABLE` + `FORCE` sur les quatre tables, policies `<table>_tenant`, `GRANT` explicites à
  `crm_app`, FK composites `(organization_id, x_id)`.

**Permissions ajoutées au catalogue**

| Clé | Portée | Rôles |
| --- | --- | --- |
| `contacts.view` | oui | owner, admin, member |
| `contacts.create` | oui | owner, admin, member |
| `contacts.update` | oui | owner, admin, member |
| `contacts.delete` | oui | owner, admin |
| `companies.view` | oui | owner, admin, member |
| `companies.manage` | oui | owner, admin |
| `tags.manage` | non | owner, admin |

**API** (toutes les routes portent une politique d'accès explicite)

- `GET/POST /contacts`, `GET/PATCH/DELETE /contacts/:id`
- `GET/POST /companies`, `GET/PATCH/DELETE /companies/:id`
- `GET/POST /tags`, `PATCH/DELETE /tags/:id`
- Recherche `?q=`, filtre `?status=`, `?companyId=`, `?tagId=`, tri, pagination par curseur.
- Écritures sensibles tracées dans l'audit (`contact.created`, `contact.updated`, `contact.deleted`,
  idem entreprises et étiquettes).

**Interface**

- Entrée « Contacts » et « Entreprises » dans la barre latérale.
- Liste avec recherche, filtres, pagination, états chargement / vide / erreur.
- Fiche contact en panneau latéral : création, édition, suppression avec confirmation.
- Sélection d'étiquettes, rattachement à une entreprise.

### Décisions prises pour ce lot

| # | Décision | Raison |
| --- | --- | --- |
| P2-1 | **Suppression logique** (`deleted_at`) sur contacts et entreprises | Un contact supprimé peut être référencé par une opportunité ou une facture ; la suppression physique casserait l'historique. Les listes filtrent `deleted_at IS NULL`. |
| P2-2 | **Pas d'unicité d'e-mail** par organisation | Deux contacts peuvent partager une adresse générique (`info@…`). La détection de doublons (lot 2.4) avertit sans bloquer. |
| P2-3 | **Propriétaire = membership**, pas utilisateur | Un utilisateur peut être membre de plusieurs organisations ; le propriétaire doit être ancré dans l'organisation active (FK composite). |
| P2-4 | **`TEAM` et `DEPARTMENT` traitées comme `ORGANIZATION`** tant que les équipes n'existent pas | Une portée qui ne peut pas être calculée ne doit pas élargir silencieusement les droits ; elle est pour l'instant équivalente à la portée large. À corriger au lot 2.5. |
| P2-5 | **Étiquettes en table dédiée**, pas en `text[]` | Renommage global, couleur, comptage et filtre indexé — un tableau de texte obligerait à réécrire toutes les lignes pour renommer une étiquette. |
| P2-6 | **`ON DELETE RESTRICT` sur le propriétaire** | Une FK composite ne peut pas porter `SET NULL` (la colonne `organization_id` est obligatoire). Le retrait d'un membre détache donc explicitement ses contacts dans la même transaction. |

## 3. Ordre d'exécution retenu

1. Schéma Prisma + migration SQL écrite à la main (RLS, policies, `GRANT`).
2. Catalogue de permissions + synchronisation des rôles système.
3. API : services, contrôleurs, DTO, audit, filtres de portée.
4. Tests : CRUD, validation, permissions par rôle, **accès croisé entre deux tenants**.
5. Interface : routes, liste, fiche, états.
6. Vérification locale, déploiement, rapport de phase.

Le lot 2.2 (portées) est traité **dans** le lot 2.1 : le filtre de portée est écrit dès la première
requête, pas ajouté après coup.

## 4. Lot 2.1 — ce qui a été livré et comment c'est vérifié

### Fichiers

| Couche | Fichiers |
| --- | --- |
| Schéma | `prisma/schema.prisma` (`Company`, `Contact`, `Tag`, `ContactTag`, enum `ContactStatus`) |
| Migration | `prisma/migrations/20261118120000_contacts_companies_tags/migration.sql` — DDL généré par `prisma migrate diff`, puis contraintes, `GRANT`, RLS et amorçage des permissions écrits à la main |
| Catalogue | `apps/api/src/modules/permissions/permission-catalog.ts` — 7 permissions, rôles système mis à jour |
| API | `apps/api/src/modules/crm/` : `crm.module.ts`, `contacts.service.ts`, `companies.service.ts`, `tags.service.ts`, `data-scope.ts`, `dto/crm.dto.ts` |
| Tests | `apps/api/test/contacts.e2e-spec.ts` ; `apps/api/test/rls.e2e-spec.ts` (4 tables ajoutées à la liste attendue) |
| Interface | `apps/web/src/pages/Crm.tsx`, `apps/web/src/components/Async.tsx`, routes et rail, styles dans `app.css` |

### Portées RBAC réellement appliquées

`dataScopeOf()` traduit la portée accordée en filtre de données :

| Portée accordée | Effet |
| --- | --- |
| `ORGANIZATION` | toutes les fiches de l'organisation |
| `OWN` | uniquement les fiches dont `owner_membership_id` est le membership de l'acteur |
| `TEAM`, `DEPARTMENT` | traitées comme `OWN` jusqu'au lot 2.5 (fail closed) |

En écriture, `OWN` force le propriétaire à soi-même : attribuer une fiche à un collègue est un acte de
portée `ORGANIZATION`. Modifier une fiche hors portée renvoie `403 OUT_OF_SCOPE` (et non 404 : la
fiche existe bien dans l'organisation).

### Vérifications exécutées

La suite Jest ne peut pas tourner sur ce poste (Node 22 : `Must use import to load ES Module:
@nestjs/core/index.js`, corrigé à partir de Node 24.9). Le module a donc été vérifié autrement, sur
l'API réelle et sur l'interface réelle.

**API — 30 assertions, toutes vertes** (comptes réels, base locale) : création / lecture / recherche /
filtres / pagination par curseur, normalisation de l'e-mail en minuscules, refus d'un contact sans
nom (`NAME_REQUIRED`), refus d'un e-mail invalide, mise à jour partielle, effacement d'un champ par
`null`, refus d'un corps vide (`NO_CHANGES`), suppression logique (404 ensuite, ligne conservée en
base), refus de supprimer une entreprise occupée (`COMPANY_IN_USE`), rattachement inter-tenant refusé
pour une entreprise (`INVALID_COMPANY`) comme pour une étiquette (`INVALID_TAG`), étiquette
insensible à la casse en doublon (`TAG_NAME_TAKEN`), cloisonnement complet entre deux organisations
(lecture, modification et suppression par identifiant → 404).

**Portées et permissions — 18 assertions, toutes vertes** : rôle personnalisé en portée `OWN` (le
commercial ne voit que sa fiche, ne peut pas modifier celle du patron → `403 OUT_OF_SCOPE`, la lecture
hors portée renvoie 404), propriétaire qui voit tout, rôle système « membre » qui peut créer mais pas
supprimer (`PERMISSION_DENIED`) ni gérer les étiquettes.

**Interface — 10 parcours, tous verts** (navigateur réel, aucune erreur console) : création d'un
contact depuis le panneau, apparition dans la liste, recherche, état vide sur recherche infructueuse,
changement de statut, suppression, création puis suppression d'une entreprise, création puis
suppression d'une étiquette.

**Mise en page** : vérifiée en 1440×900 et en 390×844. Le défilement horizontal de la page entière
sous 620 px a été corrigé (`min-width: 0` sur les enfants de `.content`, en-tête de page en colonne).

### Limites connues de ce lot

1. **`TEAM` et `DEPARTMENT` ne sont pas encore calculables** — elles retombent sur `OWN`.
2. **Pas d'import/export CSV** : la saisie est manuelle pour l'instant (lot 2.3).
3. **Pas de détection de doublons** (lot 2.4) : deux fiches identiques peuvent coexister.
4. **Les notes sont un champ texte**, pas encore un fil d'annotations horodatées.
5. **Pas de tests Jest exécutables sur ce poste** : la couverture est assurée par les scripts de
   vérification décrits ci-dessus, à rejouer dès que Node ≥ 24.9 sera disponible en CI.
