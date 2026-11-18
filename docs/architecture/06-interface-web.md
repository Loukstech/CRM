# Interface web — espace de travail

## 1. Périmètre

L'application web est une SPA React qui consomme l'API NestJS. Elle couvre pour l'instant le
socle multi-tenant déjà livré :

- connexion, inscription (avec confirmation du mot de passe, vérifiée côté interface et côté API),
  vérification d'adresse, mot de passe oublié et réinitialisation ;
- vue d'ensemble (effectifs, rôles, invitations, activité récente) ;
- équipe (liste, changement de rôle, retrait, invitation) ;
- invitations en attente et page d'acceptation (`/#/accept-invitation?token=…`, avec connexion
  ou création de compte) ;
- rôles et catalogue des permissions ;
- journal d'activité ;
- profil de l'organisation active et changement d'organisation ;
- **contacts** : liste filtrable, recherche, fiche latérale de création et d'édition, étiquettes ;
- **entreprises** : liste, création et édition en modale, comptage des contacts rattachés.

Les modules suivants (opportunités, devis, facturation, campagnes) ne sont pas encore dans
l'interface, puisqu'ils n'existent pas encore dans l'API.

## 2. Identité visuelle

Direction choisie : **encre et papier, avec un accent laiton**. C'est un registre de « maison de
commerce établie », en cohérence avec le domaine d'activité, plutôt que le bleu/orange générique des
tableaux de bord SaaS.

| Rôle | Valeur |
| --- | --- |
| Fond application | papier chaud `#f6f4ef` |
| Rail latéral et boutons principaux | encre verte `#13201c` |
| Accent (filets, état actif, liens) | laiton `#906523` |
| Surface des cartes | blanc `#ffffff` |
| Succès / danger | vert sauge `#1f7a55` / rouille `#b4362e` |

Deux familles typographiques, nettement distinctes : **Newsreader** (serif) pour les titres et le
wordmark, **DM Sans** pour l'interface. Les tokens sont définis en trois couches dans
`apps/web/src/styles/tokens.css` : primitives → sémantiques → composants.

Quelques décisions structurantes :

- un seul moment expressif (le grand titre serif sur la page de connexion) ; le reste reste discret ;
- rayons de 6 à 10 px, bordures 1 px, pas d'ombre par défaut — pas de « kit de cartes » générique ;
- une barre laiton verticale sur l'élément de navigation actif ;
- mouvement minimal : entrée de page unique, transitions à 160 ms, `prefers-reduced-motion` respecté ;
- focus clavier visible partout, cibles tactiles ≥ 34 px, sans emoji comme icônes (Lucide SVG) ;
- chaque champ de mot de passe possède une bascule « afficher / masquer » (`Eye` / `EyeOff`),
  annoncée aux lecteurs d'écran via `aria-label` et `aria-pressed`.

L'interface est responsive : rail fixe au-delà de 980 px, tiroir avec bouton menu en dessous.

## 3. Stack et structure

```text
apps/web/
  index.html                  polices, favicon, point d'entrée
  vite.config.ts              proxy /api vers l'API en ligne en développement
  src/
    main.tsx                  montage React
    App.tsx                   routage public / protégé
    lib/
      api.ts                  client typé, jetons, rafraîchissement automatique sur 401
      auth.tsx                contexte d'authentification et permissions effectives
    components/
      Shell.tsx               rail, barre supérieure, sélecteur d'organisation
      ui.tsx                  boutons, champs, cartes, badges, modale, toasts
      Async.tsx               chargement asynchrone et états chargement / erreur
    pages/
      Auth.tsx                connexion, inscription, vérification, mot de passe
      App.tsx                 vue d'ensemble, équipe, invitations, rôles, audit, organisation
      Crm.tsx                 contacts, entreprises, étiquettes
    styles/                   tokens, global, ui, auth, app
```

Dépendances : React 19, React Router 7, Lucide React, Vite 6, TypeScript 6. Aucun framework CSS et
aucune bibliothèque de composants : les styles sont écrits en CSS natif pour garder la main sur
l'identité visuelle.

## 4. Développement

```bash
npm install
npm run dev:web     # http://localhost:5173
```

En développement, Vite proxifie `/api` vers `https://api-crm.timestradinginter.com`. L'API reçoit donc
les appels comme s'ils venaient de son propre domaine : inutile d'ouvrir `CORS_ORIGINS` à
`localhost`, et on travaille contre la base réelle. En production, l'interface est servie sur
`https://crm.timestradinginter.com` et `VITE_API_BASE_URL` pointe sur `api-crm.`.

```bash
npm run build:web   # typecheck puis bundle de production dans apps/web/dist
```

La commande racine `npm run build` ne compile que l'API : le déploiement Render existant reste
inchangé. Le front se construit séparément.

## 5. Comptes de test

Le compte créé lors de la phase 1b fonctionne : **`contact@timestradinginter.com`**. Son mot de
passe provisoire a été communiqué hors du dépôt et n'est volontairement pas consigné ici.
`emailVerified` est encore à `false` : le lien de vérification envoyé par e-mail pointe désormais sur
`/#/verify-email?token=…`, une route **implémentée dans cette application** (elle répondait 404 avant).
Le routage passe par le fragment (`HashRouter`) : l'hébergeur statique ne reçoit que la racine du
site, quelle que soit la page affichée. Ce mot de passe est provisoire et sera à changer dès que
l'interface sera ouverte.

## 6. Déploiement en ligne

| URL | Rôle |
| --- | --- |
| `https://crm.timestradinginter.com` | interface Louk's CRM (Render Static Site `srv-dbus2tuk1f9s73b6oflg`) |
| `https://api-crm.timestradinginter.com/api/v1` | API (Render Web Service `srv-dbrj68e7bikc73fu2sfg`) |
| `https://api-crm.timestradinginter.com/api/docs` | Swagger, laissé actif pendant le développement |

## 7. Gestion des organisations

Les données sont isolées par organisation (RLS). Le sélecteur en haut à droite affiche
l'organisation active et permet de basculer vers celles dont l'utilisateur est membre. La page
« Organisation » édite l'identité et les préférences de l'organisation active : nom, pays, devise,
fuseau horaire et langue — sous réserve de la permission `organization.update`.

Les écrans « Équipe », « Invitations » et « Rôles & accès » portent uniquement sur l'organisation
active. Une invitation crée un membre avec le rôle choisi dès que son destinataire accepte le lien ;
le statut passe alors de `PENDING` à `ACCEPTED`.

La **création d'une organisation supplémentaire** existe côté API (`POST /organizations`) mais n'a
pas encore d'écran dédié : pour l'instant, la première organisation est créée à l'inscription, et
les suivantes s'obtiennent par invitation.

## 8. Contacts et entreprises (phase 2.1)

Deux écrans ont été ajoutés au rail, sous « Espace de travail ».

**Contacts** (`/#/contacts`)

- barre de filtres : recherche plein texte (nom, prénom, e-mail, téléphone, fonction, entreprise),
  statut, entreprise, étiquette — la recherche est temporisée à 300 ms ;
- tableau paginé par curseur (« Charger plus »), avec personne, entreprise, statut, étiquettes,
  propriétaire et date de création ;
- fiche en **panneau latéral** (et non en page séparée) : on garde la liste en contexte. Le panneau
  s'ouvre au clic sur une ligne ou au clavier (Entrée / Espace), se ferme avec `Échap` ;
- le pied du panneau reste visible pendant que le formulaire défile ;
- suppression avec confirmation explicite ; la fiche sort des listes mais reste en base
  (suppression logique).

**Entreprises** (`/#/entreprises`)

- liste avec recherche, secteur, ville et nombre de contacts actifs ;
- création et édition en modale, avec pied de modale fixe ;
- la suppression est refusée tant que des contacts actifs y sont rattachés (code `COMPANY_IN_USE`).

**Étiquettes**

Gérées depuis un bouton de l'en-tête des contacts (visible avec `tags.manage`) : création avec
couleur, renommage en place, recoloration, suppression. Une étiquette supprimée est retirée de tous
les contacts (cascade en base).

Les actions sont masquées quand la permission manque : `contacts.create`, `contacts.update`,
`contacts.delete`, `companies.manage`, `tags.manage`. Le masquage est un confort — l'API refuse de
toute façon l'action.

### Comportement mobile

Sous 620 px, l'en-tête de page passe en colonne, les filtres s'empilent, le tableau défile
horizontalement dans sa carte et le panneau de fiche occupe toute la largeur. Les enfants de
`.content` reçoivent `min-width: 0` : sans cela, un tableau large élargit la page entière et fait
apparaître un défilement horizontal au niveau du document.

## 9. Ce qui reste

- Éteindre Swagger (`SWAGGER_ENABLED=0`) **uniquement en fin de développement**, en même temps que la
  rotation des secrets : il reste volontairement actif pour servir d'interface de test.
- Changer le mot de passe provisoire de `contact@timestradinginter.com` au moment de l'ouverture.
- Brancher les futurs modules métier sur la même charte (la structure de page est déjà en place).
- Écran de création d'une organisation supplémentaire (l'API `POST /organizations` existe).
- Gestion du profil : changement de mot de passe, liste et révocation de ses sessions.
- Import / export CSV des contacts, détection de doublons (lots 2.3 et 2.4).
