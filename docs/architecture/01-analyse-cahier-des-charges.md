# 01 — Analyse du cahier des charges

Source : [cahier_des_charges_CRM_SaaS.md](../../cahier_des_charges_CRM_SaaS.md) (v1.0), lu intégralement.

## 1. Ce que demande le document

Un CRM SaaS **multi-tenant** vendu par abonnement, avec web + mobile sur une même API, douze modules
fonctionnels (§3), une console éditeur (§2.1) et environ 80 tables (§6.2). Le cahier impose un ordre
de travail (§14.2) et une première mission limitée (§16) : **fondations d'abord**, modules ensuite,
par lots validés.

Trois exigences structurent tout le reste :

| Exigence | Référence | Conséquence d'architecture |
| --- | --- | --- |
| Isolation stricte entre organisations | §1.4, §6.1, §12 | `organization_id` partout, RLS PostgreSQL, clés étrangères composites, tests d'accès croisé |
| Contrôle d'accès sur chaque endpoint | §7.1, §8.2, §12 | Garde global en refus par défaut, permissions + portées |
| Ne rien présenter comme opérationnel sans backend réel | §14.3 | Les connecteurs absents sont déclarés absents ; l'API refuse de démarrer en production sans envoi d'e-mail réel |

## 2. Points forts du cahier

- Monolithe modulaire explicitement préféré aux microservices (§5.2) : adapté à une petite équipe.
- Séparation nette facturation client / facturation SaaS (§3.8).
- Sécurité de l'IA pensée dès le départ (§3.11) : pas de SQL libre, outils métier soumis aux permissions.
- Critères de sortie vérifiables (§12).

## 3. Ambiguïtés relevées et choix proposés

Conformément au §14.1.4, chaque ambiguïté est signalée avec le choix retenu **par défaut** pour ne pas
bloquer la phase 1. Les lignes marquées **À confirmer** attendent votre décision ; les autres sont
réversibles à faible coût.

| # | Sujet | Ambiguïté | Choix retenu | Statut |
| --- | --- | --- | --- | --- |
| A1 | Hébergement | Le cahier suppose Docker et une infrastructure auto-gérée ; **vous n'avez pas de VPS** | Cible managée : PostgreSQL géré + hébergement Node.js géré ; Docker devient optionnel. Voir [ADR-0004](../decisions/ADR-0004-hebergement-sans-vps.md) | **À confirmer** (choix de l'hébergeur) |
| A2 | Gestionnaire de paquets | Non précisé | Workspaces **npm** (aucun outil à installer). Migration vers pnpm possible plus tard | Réversible |
| A3 | Schéma Prisma | « Premier schéma cohérent » (§16) vs ~80 tables (§6.2) | Le schéma ne contient que les tables **de la phase en cours** ; l'ERD documente la cible complète. Chaque module ajoute ses tables dans sa migration, avec RLS et tests | Réversible |
| A4 | Rôles | `roles.organization_id` (§6.2) mais pas de rôles par défaut définis | 3 rôles système par organisation (`owner`, `admin`, `member`) non modifiables + rôles personnalisés. Les rôles métier (commercial, support…) arriveront avec leurs modules | **À confirmer** (liste des rôles par défaut) |
| A5 | Portées RBAC | « propriétaire, équipe, département ou organisation » (§8.2) sans modèle | Portée stockée sur chaque couple rôle/permission (`OWN < TEAM < DEPARTMENT < ORGANIZATION`). Appliquée aux ressources à propriétaire dès la phase 2 | Réversible |
| A6 | Transport du jeton de rafraîchissement | Non précisé | Renvoyé dans le corps JSON (convient au mobile). Pour le web, cookie `httpOnly` + protection CSRF à décider en phase 1b | **À confirmer** |
| A7 | MFA / OAuth social | Listés en §8.1 sans priorité | Reportés en phase 1b (MFA TOTP) et ultérieure (OAuth). **Non implémentés** | **À confirmer** (priorité) |
| A8 | Console Super Admin | §2.1, aucune phase dédiée dans §11 | Phase dédiée après les abonnements (phase 6b). Aucun rôle éditeur n'existe encore : aucun accès transverse n'est possible aujourd'hui | **À confirmer** |
| A9 | Énumération de comptes | Non traité | L'inscription répond 409 si l'e-mail existe (ergonomie) ; connexion et mot de passe oublié ne révèlent rien ; limitation de débit sur toutes ces routes | Réversible |
| A10 | Fournisseur d'e-mails | « SMTP, Resend ou équivalent » (§7.2) | Port `Mailer` + pilote `log` de développement qui **n'envoie rien**. Connecteur réel à choisir | **À confirmer** |
| A11 | Files d'attente | Redis + BullMQ (§5.1) | Maintenu comme cible, mais **non installé** en phase 1 (rien ne s'exécute en arrière-plan). Sans VPS, une file basée sur PostgreSQL est une alternative sérieuse à évaluer en phase 7 | **À confirmer** en phase 7 |
| A12 | Unicité des contacts | « `(organization_id, email_normalized)` lorsque la règle métier l'autorise » | À trancher en phase 2 (unicité stricte ou simple détection de doublons) | **À confirmer** en phase 2 |

Les décisions listées au §15 du cahier (marque, pays, prix, fiscalité, RPO/RTO, hors-ligne mobile, RH)
restent ouvertes et ne bloquent pas les phases 1 à 3.

## 4. Risques principaux

| Risque | Impact | Parade |
| --- | --- | --- |
| Fuite entre tenants | Critique, fin de confiance commerciale | Double barrière (filtre applicatif + RLS), FK composites, tests à chaque module, test générique qui échoue si une table tenant n'a pas de RLS |
| Périmètre très large (33 semaines estimées pour une équipe) | Dérive, modules à moitié finis | Travail par phases avec Definition of Done (§14.5), validation avant chaque phase structurante |
| Dépendances externes (WhatsApp, paiements, Mobile Money) | Indisponibles selon les pays | Adaptateurs isolés ; aucun connecteur simulé présenté comme réel |
| Hébergement sans VPS | Workers et temps réel exigent un processus permanent | Choix d'hébergeur à valider avant la phase 7 ; voir ADR-0004 |
| Conformité (RGPD, facturation locale) | Juridique | Mécanismes prévus (consentements, export, suppression) ; validation par un conseil compétent |
