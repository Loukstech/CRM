# ADR-0007 — Envoi d'e-mails par API HTTP plutôt que SMTP

- **Statut :** accepté (2026-11-13) ; **activation en attente d'une clé fournisseur**
- **Contexte :** les e-mails transactionnels (vérification d'adresse, réinitialisation de mot de
  passe, invitation) passaient par le pilote `smtp`, avec la boîte Hostinger
  `contact@timestradinginter.com`. Les identifiants ont été validés en direct : authentification
  acceptée, message remis. Depuis l'application déployée, chaque envoi échouait pourtant :

  ```
  ERROR AuthService  Échec d'envoi de l'e-mail « email-verification » : Connection timeout
  ```

## Constat

Render documente la cause ([`render.com/docs/free`](https://render.com/docs/free)) :

> Free web services can't send outbound network traffic on ports `25`, `465`, or `587`, commonly
> used for SMTP.
>
> Render blocks outbound traffic on port `25` for *all* services.

Le port 25 est filtré **quel que soit le plan** ; les ports 465 et 587 le sont sur les instances
Free. Sur l'hébergement retenu ([ADR-0006](ADR-0006-fournisseurs-hebergement.md)), aucun réglage
SMTP — changement de port, TLS implicite ou explicite, autre boîte — ne peut fonctionner.

## Décision

1. **Ajouter un troisième pilote `http`** derrière le port `Mailer` existant, sans toucher aux
   modules métier : `AuthService` continue d'appeler `mailer.send(...)` et ignore le transport.
2. **S'appuyer sur l'API HTTPS du fournisseur** (port 443, jamais filtré). Deux fournisseurs sont
   implémentés, sélectionnés par `MAIL_HTTP_PROVIDER` : `brevo` (défaut) et `resend`.
3. **Aucune dépendance ajoutée** : `fetch` est natif depuis Node 18. L'adaptateur pose un délai de
   15 s et réessaie une fois sur `429` et `5xx`, qui sont transitoires.
4. **Valider au démarrage, pas à l'exécution** : quand `MAIL_DRIVER=http`, la validation Zod exige
   `MAIL_HTTP_PROVIDER`, `MAIL_HTTP_API_KEY` et `MAIL_FROM`. Une configuration incomplète empêche
   le démarrage plutôt que de faire échouer silencieusement le premier envoi.

Les trois pilotes :

| `MAIL_DRIVER` | Transport | Usage |
| --- | --- | --- |
| `log` | aucun — journalise le lien | développement (refusé en production) |
| `smtp` | ports 25 / 465 / 587 | hébergeur qui ne filtre pas ces ports |
| `http` | HTTPS 443 | Render Free, et par défaut en production |

## Pourquoi pas les alternatives

| Option | Verdict |
| --- | --- |
| Passer Render en plan Starter (7 $/mois) | Fonctionne, mais paie une instance plus grosse pour une seule fonctionnalité et garde un SMTP de boîte mail, médiocre en délivrabilité |
| Tunnel SMTP sur un port autorisé | Fragile, non supporté, et le port 25 reste filtré |
| Garder SMTP et accepter l'absence d'e-mails | Repousse le problème : vérification d'adresse et récupération de compte sont indispensables |
| Fournisseur d'e-mail dédié en SMTP | Même blocage : le problème est le port, pas le fournisseur |

## Contrepartie acceptée

- Une **clé API supplémentaire** à gérer et à tourner.
- Le **domaine doit être authentifié chez le fournisseur** (SPF, DKIM, DMARC) : sans cela, l'envoi
  depuis `contact@timestradinginter.com` est refusé ou classé en indésirable. Ces enregistrements se
  posent dans la zone Hostinger.
- Un **couplage au format d'API** du fournisseur, contenu dans un seul fichier
  (`apps/api/src/modules/mail/http-mailer.ts`) et isolé par le port `Mailer`.

## Conséquence

Le pilote `http` est écrit, compilé et déployé, mais **inactif** : `MAIL_DRIVER` vaut encore `smtp`
côté plateforme, faute de clé. L'application reste utilisable entre-temps — `login` n'exige pas
`emailVerifiedAt`. L'activation se fait en deux temps, dans cet ordre : saisir `MAIL_HTTP_API_KEY`,
puis basculer `MAIL_DRIVER` sur `http`.
