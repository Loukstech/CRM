# Interface web — espace de travail

## 1. Périmètre

L'application web est une SPA React qui consomme l'API NestJS. Elle couvre pour l'instant le
socle multi-tenant déjà livré :

- connexion, inscription, vérification d'adresse, mot de passe oublié et réinitialisation ;
- vue d'ensemble (effectifs, rôles, invitations, activité récente) ;
- équipe (liste, changement de rôle, retrait, invitation) ;
- invitations en attente ;
- rôles et catalogue des permissions ;
- journal d'activité ;
- profil de l'organisation active et changement d'organisation.

Les modules CRM métier (contacts, ventes, facturation) ne sont pas encore dans l'interface, puisqu'ils
n'existent pas encore dans l'API.

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
- focus clavier visible partout, cibles tactiles ≥ 34 px, sans emoji comme icônes (Lucide SVG).

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
    pages/
      Auth.tsx                connexion, inscription, vérification, mot de passe
      App.tsx                 écrans de l'espace de travail
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

En développement, Vite proxifie `/api` vers `https://crm.timestradinginter.com`. L'API reçoit donc
les appels comme s'ils venaient de son propre domaine : inutile d'ouvrir `CORS_ORIGINS` à
`localhost`, et on travaille contre la base réelle.

```bash
npm run build:web   # typecheck puis bundle de production dans apps/web/dist
```

La commande racine `npm run build` ne compile que l'API : le déploiement Render existant reste
inchangé. Le front se construit séparément.

## 5. Comptes de test

Le compte créé lors de la phase 1b fonctionne : **`contact@timestradinginter.com`**. Son mot de
passe provisoire a été communiqué hors du dépôt et n'est volontairement pas consigné ici.
`emailVerified` est encore à `false` : le lien de vérification envoyé par e-mail pointe désormais sur
`/verify-email?token=…`, une route **implémentée dans cette application** (elle répondait 404 avant).
Ce mot de passe est provisoire et sera à changer dès que l'interface sera ouverte.

## 6. Ce qui reste

- **Déployer le front** : le domaine `crm.timestradinginter.com` sert aujourd'hui l'API. Il faut
  choisir entre un sous-domaine dédié (par exemple `app.`) avec un service statique, ou servir le
  bundle depuis l'API sous `/` — et mettre `CORS_ORIGINS` / `APP_WEB_URL` à jour. Décision volontairement
  laissée ouverte.
- Éteindre Swagger une fois le front en ligne, Swagger étant aujourd'hui la seule autre interface.
- Brancher les futurs modules métier sur la même charte (la structure de page est déjà en place).
