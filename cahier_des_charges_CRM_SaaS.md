# CAHIER DES CHARGES FONCTIONNEL ET TECHNIQUE

## Plateforme CRM SaaS --- Version 1.0

**Nature :** logiciel SaaS de gestion de la relation client\
**Marché cible :** international, toutes entreprises et tous secteurs\
**Plateformes :** application web, Android et iOS\
**Architecture :** multi-tenant, backend modulaire\
**Langue initiale :** français, architecture multilingue\
**Monnaies :** multi-devises\
**Stack recommandée :** React, TypeScript, React Native, Expo, NestJS,
PostgreSQL, Prisma, Redis, BullMQ et Docker.

> Document de référence destiné à l'équipe de développement et à un
> agent de programmation (notamment Claude Code). Les décisions marquées
> « à confirmer » doivent être validées avant leur implémentation en
> production.

------------------------------------------------------------------------

# 1. Vision et objectifs

## 1.1 Vision du produit

Développer une plateforme CRM SaaS complète permettant aux entreprises
de centraliser et piloter leurs activités commerciales, marketing,
administratives et relationnelles. Chaque entreprise dispose de son
propre espace de travail, de ses collaborateurs, clients, prospects,
ventes, campagnes, automatisations et indicateurs.

Le produit doit être commercialisable à l'international et évoluer sans
refonte majeure lorsque le nombre d'organisations et d'utilisateurs
augmente.

## 1.2 Objectifs

-   Centraliser les données clients et prospects.
-   Structurer et accélérer les processus de vente.
-   Améliorer le suivi commercial et la fidélisation.
-   Automatiser les tâches répétitives.
-   Faciliter le travail collaboratif.
-   Mesurer les performances commerciales et marketing.
-   Fournir une assistance IA contextualisée et sécurisée.
-   Commercialiser le logiciel par abonnements SaaS.

## 1.3 Public cible

PME, grandes entreprises, commerces, distributeurs, agences,
prestataires de services, cabinets de conseil, centres de formation,
immobilier, startups, freelances, équipes commerciales, centres d'appels
et entreprises industrielles.

Le produit doit être configurable par secteur : champs personnalisés,
pipelines, catégories, statuts, formulaires, workflows et modèles de
documents.

## 1.4 Principes produit

1.  Multi-tenant dès la première migration.
2.  Interface simple malgré la richesse fonctionnelle.
3.  Modules activables selon le plan et les permissions.
4.  Web et mobile reposant sur la même API métier.
5.  API documentée et intégrations extensibles.
6.  Sécurité et audit intégrés dès la conception.
7.  Architecture modulaire sans microservices prématurés.
8.  Données exportables et absence de verrouillage propriétaire inutile.

------------------------------------------------------------------------

# 2. Utilisateurs et espaces de la plateforme

## 2.1 Console Super Admin SaaS

Espace réservé à l'éditeur du CRM : - Gestion, activation, suspension et
clôture des organisations. - Gestion des plans, tarifs, essais,
abonnements et coupons. - Suivi des paiements SaaS, factures et revenus
récurrents. - Gestion des limites d'utilisation et des fonctionnalités
par plan. - Gestion des comptes et incidents de support. - Statistiques
globales d'adoption et d'utilisation. - Journal d'audit et configuration
globale. - Gestion des fournisseurs d'intégration et de leurs états. -
Outils d'assistance, sans accès libre et non audité aux données privées
des clients.

L'accès de support exceptionnel aux données d'une organisation doit être
limité, autorisé, justifié et journalisé.

## 2.2 Espace Entreprise

Chaque organisation possède un espace indépendant : - Profil, logo,
coordonnées, pays, devise et fuseau horaire. - Membres, équipes,
départements, rôles et permissions. - Contacts, entreprises, prospects
et opportunités. - Pipelines et processus configurables. - Activités,
tâches et calendrier. - Produits, devis, factures et paiements. -
Marketing, campagnes et consentements. - Tickets et base de
connaissances. - Automatisations et assistant IA. - Paramètres,
intégrations, exports et rapports. - Abonnement et consommation du plan.

## 2.3 Espace Collaborateur

L'espace est adapté au rôle et aux droits du collaborateur : ses
contacts et opportunités, les éléments de son équipe, ses tâches,
rendez-vous, conversations, tickets et rapports autorisés.

## 2.4 Application mobile

Application Android et iOS pour : - Dashboard synthétique. - Recherche
et consultation des contacts. - Création et qualification de
prospects. - Consultation et mise à jour du pipeline. - Appels et
journalisation des activités. - Tâches, rendez-vous et notifications
push. - Notes et pièces jointes. - Consultation des devis, factures et
tickets. - Assistant IA. - Synchronisation différée de certaines
opérations hors connexion.

Le mode hors connexion doit être limité à des fonctions explicitement
définies. Les conflits de synchronisation doivent être détectés et
résolus sans écrasement silencieux.

------------------------------------------------------------------------

# 3. Modules fonctionnels

## 3.1 Dashboard et analytics

### Indicateurs

-   Contacts, prospects et clients actifs.
-   Nouveaux prospects sur une période.
-   Opportunités ouvertes, gagnées et perdues.
-   Valeur du pipeline et prévisions pondérées.
-   Chiffre d'affaires facturé et encaissé, clairement distingués.
-   Devis en attente et factures impayées.
-   Tâches en retard et rendez-vous à venir.
-   Performance par commercial, équipe, produit et source.
-   Performance des campagnes et tickets support.

### Visualisations et personnalisation

-   Courbes d'évolution, histogrammes et répartitions.
-   Filtres par période, équipe, propriétaire, source et pipeline.
-   Widgets réorganisables et tableaux de bord enregistrés.
-   Export PDF/CSV selon les permissions.
-   Définition claire de chaque KPI et de sa formule.

Les chiffres du dashboard doivent être calculés côté serveur, respecter
le périmètre d'accès et être optimisés par indexation ou agrégats
lorsque nécessaire.

## 3.2 Contacts et entreprises

### Fiche contact

-   Identifiant, prénom, nom, photo.
-   E-mail, téléphone principal et secondaire.
-   Adresse, ville, région, pays.
-   Entreprise et fonction.
-   Source d'acquisition, statut et tags.
-   Propriétaire/responsable.
-   Champs personnalisés.
-   Notes, documents et consentements.
-   Date de création et dernière interaction.

### Fiche entreprise

-   Nom commercial et raison sociale.
-   Identifiant fiscal, secteur et taille.
-   Logo, site web et coordonnées.
-   Adresse et pays.
-   Contacts associés et leurs fonctions.
-   Opportunités, activités, documents et historique.

### Opérations

-   CRUD, archivage et suppression selon droits.
-   Import CSV/XLSX avec aperçu, mapping, validation et rapport
    d'erreurs.
-   Export selon filtres et permissions.
-   Détection des doublons configurable (e-mail, téléphone, nom).
-   Fusion contrôlée avec conservation des historiques.
-   Recherche globale, filtres sauvegardés et tags.
-   Timeline des interactions.
-   Champs personnalisés typés et configurables.

## 3.3 Leads et prospection

-   Création manuelle, import, formulaire web, API et connecteurs
    publicitaires.
-   Capture de source, campagne et paramètres d'attribution.
-   Qualification selon besoin, budget, délai et engagement.
-   Score configurable et explicable.
-   Attribution manuelle, par règle ou rotation entre commerciaux.
-   Statuts : nouveau, à contacter, contacté, qualifié, non qualifié,
    converti, perdu.
-   Historique de changements et de contacts.
-   Conversion vers contact, entreprise et opportunité sans perte
    d'historique.
-   Détection des leads sans propriétaire ou sans suivi.

Le scoring automatique doit rester configurable et ne pas prendre de
décision discriminatoire ou opaque.

## 3.4 Pipelines et opportunités

-   Plusieurs pipelines par organisation.
-   Étapes personnalisables avec ordre et probabilité.
-   Vues Kanban et liste.
-   Déplacement entre étapes avec journal d'historique.
-   Fiche opportunité : nom, contact, entreprise, produits, montant,
    devise, probabilité, date de clôture, propriétaire, pipeline, étape,
    notes et documents.
-   Opportunités gagnées/perdues et motifs de perte.
-   Prévisions pondérées et non pondérées.
-   Alertes d'inactivité et de clôture imminente.
-   Historique des changements et des montants.

## 3.5 Activités, tâches et calendrier

Types d'activité : appel, e-mail, rendez-vous, réunion, démonstration,
visite, relance et activité personnalisée.

Tâche : - Titre, description, priorité et statut. - Responsable,
créateur et abonnés éventuels. - Date de début, échéance et rappel. -
Liens vers contact, entreprise, lead, deal ou ticket. - Commentaires et
historique.

Vues : liste, calendrier, Kanban, mes tâches, tâches de l'équipe, tâches
en retard.

Prévoir intégration Google Calendar et Outlook avec gestion des fuseaux
horaires, synchronisation et prévention des doublons.

## 3.6 Marketing et campagnes

-   Campagnes e-mail, SMS et WhatsApp via fournisseurs autorisés.
-   Audience et segments statiques ou dynamiques.
-   Éditeur de modèles, variables de personnalisation et aperçu.
-   Planification, tests et suivi d'envoi.
-   Statistiques : délivrés, rebonds, clics, désinscriptions et plaintes
    lorsqu'elles sont disponibles.
-   Gestion des listes d'opposition et des consentements.
-   Historique de consentement : finalité, canal, date, source et
    preuve.
-   Gestion des préférences de communication par contact.
-   Exclusion automatique des contacts désinscrits ou opposés.
-   Limitation de fréquence et prévention des envois accidentels.

Les ouvertures e-mail sont approximatives (protection de confidentialité
et chargement d'images). Ne pas les présenter comme une mesure
parfaitement fiable. Les campagnes doivent respecter les lois
applicables et les conditions des fournisseurs.

## 3.7 Service client et support

-   Création de tickets depuis l'interface, e-mail ou API.
-   Numéro unique, sujet, description, client, catégorie et priorité.
-   Affectation à un agent ou une équipe.
-   Statuts : nouveau, ouvert, en cours, en attente, résolu, fermé.
-   Messages publics et notes internes clairement différenciés.
-   Pièces jointes et historique.
-   SLA configurables, escalades et alertes.
-   Macros/réponses prédéfinies.
-   Base de connaissances.
-   Enquêtes de satisfaction et rapports de résolution.

## 3.8 Produits, devis, factures et paiements

### Catalogue

Produits/services, référence, description, prix, devise, unité,
catégorie, taxes et statut.

### Devis

-   Numérotation et modèles par organisation.
-   Client, lignes, quantités, prix, remises, taxes et totaux.
-   Date d'émission et validité.
-   PDF, envoi, suivi, acceptation ou refus.
-   Conversion en facture avec traçabilité.

### Factures

-   Numérotation, client, lignes, devise et totaux.
-   Dates d'émission et d'échéance.
-   Statuts brouillon, émise, partiellement payée, payée, en retard,
    annulée.
-   Avoirs et corrections selon les règles locales à définir.
-   PDF et envoi.
-   Historique d'événements.

### Paiements

-   Paiement total ou partiel.
-   Moyen, référence externe, montant, devise et statut.
-   Échec, remboursement et rapprochement.
-   Webhooks vérifiés et idempotence.
-   Journal financier non destructif.

Séparer strictement la facturation commerciale des clients du CRM et la
facturation des abonnements SaaS de l'éditeur. Ne pas présenter ce
module comme une comptabilité complète.

## 3.9 Équipes et RH opérationnelles

-   Fiches collaborateurs et fonctions.
-   Départements, équipes et hiérarchie.
-   Affectations et responsables.
-   Objectifs individuels et collectifs.
-   Indicateurs d'activité et de performance.
-   Demandes de congés/absences et circuit de validation.
-   Historique des décisions.

Le périmètre RH initial ne comprend pas la paie, sauf décision
ultérieure. Les données personnelles RH doivent bénéficier de
permissions plus strictes.

## 3.10 Automatisations

Créer un constructeur visuel de workflows fondé sur : déclencheur →
conditions → actions.

### Déclencheurs

Nouveau contact, lead, changement de statut, deal créé/gagné/perdu,
devis envoyé, facture en retard, ticket créé, échéance de tâche,
inactivité, date planifiée ou webhook.

### Conditions

Source, pays, tags, montant, propriétaire, statut, étape, date, segment
et champs personnalisés.

### Actions

Créer une tâche, affecter un utilisateur, envoyer une notification,
envoyer un e-mail via connecteur, ajouter un tag, mettre à jour un
champ, appeler un webhook ou déclencher un autre workflow.

### Exécution

-   Délais et planification.
-   Branches conditionnelles.
-   Versions publiées et brouillons.
-   Historique d'exécution et logs.
-   Reprise sur erreur avec stratégie de retry.
-   Clés d'idempotence.
-   Limites de fréquence et prévention des boucles.
-   Arrêt, pause et reprise.
-   Quotas par plan.

Les actions sensibles (paiement, suppression, envoi massif) doivent
avoir des garde-fous et, si nécessaire, une validation humaine.

## 3.11 Intelligence artificielle

### Assistant

Questions en langage naturel sur les données autorisées, synthèses de
ventes, prospects à relancer, rédaction d'e-mails, comptes rendus et
rapports.

### Fonctions

-   Résumé de conversations et d'historiques.
-   Suggestions de prochaines actions.
-   Aide à la qualification.
-   Détection d'opportunités inactives.
-   Prévisions indicatives.
-   Génération de contenus.
-   Recherche sémantique dans les données accessibles.

### Architecture

Couche d'abstraction fournisseur : OpenAI, Anthropic, Gemini, Mistral ou
fournisseurs compatibles via passerelle. Modèles sélectionnables selon
plan, coût et disponibilité.

### Sécurité IA

-   Appliquer les permissions de l'utilisateur à chaque récupération de
    données.
-   Ne jamais donner au modèle un accès SQL libre.
-   Utiliser des outils métier autorisés et validés.
-   Masquer les secrets et données inutiles.
-   Isoler les contextes par organisation.
-   Journaliser usage, modèle, tokens et coût sans stocker plus de
    données que nécessaire.
-   Demander confirmation avant toute action externe ou irréversible.
-   Signaler les réponses incertaines et ne pas inventer de chiffres.

## 3.12 Notifications et centre de messages

-   Notifications in-app, e-mail et push.
-   Préférences par utilisateur et par type.
-   Rappels de tâches et rendez-vous.
-   Alertes d'affectation et de changement de statut.
-   Centre de notifications avec lu/non lu.
-   Déduplication et regroupement.
-   Gestion des erreurs de livraison.

------------------------------------------------------------------------

# 4. SaaS, abonnements et monétisation

## 4.1 Plans

Plans proposés à titre de modèle : - Free : fonctions essentielles et
limites réduites. - Starter : petites entreprises. - Professional : PME
et automatisations. - Business : IA, marketing et équipes avancées. -
Enterprise : capacités, support et configuration avancés.

Les prix, devises et limites sont à définir après étude du marché.

## 4.2 Limites et entitlements

Chaque plan peut limiter : - Utilisateurs et sièges. - Contacts et
entreprises. - Stockage. - Campagnes et volume d'envoi. - Workflows
actifs et exécutions. - Crédits IA. - Pipelines. - Intégrations. -
Historique et exports.

Centraliser les droits dans un service d'entitlements. Ne pas coder les
limites en dur dans les composants frontend.

## 4.3 Cycle d'abonnement

Essai → abonnement actif → renouvellement → paiement échoué/grâce →
suspension éventuelle → réactivation ou annulation.

Prévoir mensuel/annuel, changement de plan, prorata si retenu, coupons,
factures SaaS, annulation et historique. Le prestataire de paiement doit
être interchangeable.

------------------------------------------------------------------------

# 5. Architecture technique

## 5.1 Choix recommandés

  Couche              Technologie                 Rôle
  ------------------- --------------------------- -------------------------------
  Web                 React + Vite + TypeScript   Application navigateur
  UI                  Tailwind CSS + shadcn/ui    Composants et design system
  Navigation web      React Router                Routage
  Données web         TanStack Query              Cache et requêtes serveur
  État local          Zustand                     État d'interface
  Formulaires         React Hook Form + Zod       Validation
  Mobile              React Native + Expo         Android/iOS
  Navigation mobile   Expo Router                 Navigation
  Backend             Node.js + NestJS            API et logique métier
  ORM                 Prisma                      Accès et migrations DB
  Base                PostgreSQL                  Données transactionnelles
  Cache/queue         Redis + BullMQ              Cache et tâches asynchrones
  Temps réel          Socket.IO ou SSE            Notifications et mises à jour
  Fichiers            Stockage S3 compatible      Documents et médias
  Documentation API   Swagger/OpenAPI             Contrat API
  Déploiement         Docker                      Environnements reproductibles

## 5.2 Style architectural

Commencer par un **monolithe modulaire** NestJS, organisé par domaines
métier. Chaque module expose des services et contrats clairs. Éviter les
microservices au lancement : ils ajoutent de la complexité
opérationnelle avant qu'elle soit nécessaire.

Extraire un service indépendant uniquement lorsqu'un besoin mesuré le
justifie (charge, isolation, équipe, disponibilité ou intégration).

## 5.3 Schéma logique

``` text
WEB (React)             MOBILE (React Native)
     |                         |
     +----------- HTTPS -------+
                  |
             API NestJS
                  |
       Authentification / RBAC
       Tenant Context / Quotas
                  |
   +--------------+------------------+
   |              |                  |
 Contacts      Sales              Marketing
 Support       Billing            HR
 Automation    AI                 Analytics
   |              |                  |
   +--------------+------------------+
                  |
       PostgreSQL / Prisma
          |             |
        Redis        S3 Storage
          |
       BullMQ Workers
          |
  Email / WhatsApp / SMS / IA
  Calendar / Paiements / Webhooks
```

## 5.4 Structure du dépôt

``` text
crm-platform/
  apps/
    api/
      src/
        modules/
          auth/
          organizations/
          memberships/
          users/
          roles/
          permissions/
          teams/
          contacts/
          companies/
          leads/
          pipelines/
          deals/
          activities/
          tasks/
          calendar/
          products/
          quotes/
          invoices/
          payments/
          marketing/
          campaigns/
          support/
          tickets/
          automation/
          ai/
          analytics/
          subscriptions/
          notifications/
          integrations/
          audit/
        common/
        config/
        database/
        main.ts
    web/
    mobile/
    worker/
  packages/
    shared/
    types/
    validators/
    api-client/
    ui/
  prisma/
    schema.prisma
    migrations/
    seed/
  infrastructure/
    docker/
    nginx/
    monitoring/
    deployment/
  docs/
    architecture/
    api/
    decisions/
  .env.example
  docker-compose.yml
  README.md
```

Les noms et la répartition peuvent évoluer, mais les frontières métier
doivent rester explicites.

------------------------------------------------------------------------

# 6. Modèle de données et règles multi-tenant

## 6.1 Stratégie d'isolation

Approche initiale : base PostgreSQL partagée, schéma partagé, colonne
`organization_id` sur chaque ressource appartenant à une organisation.

Règles obligatoires : - Chaque requête métier est exécutée dans un
contexte d'organisation validé. - Ne jamais faire confiance à un
`organization_id` envoyé par le navigateur sans vérifier l'appartenance
de l'utilisateur. - Toutes les lectures, modifications et suppressions
sont limitées au tenant. - Les relations entre entités doivent vérifier
que les deux entités appartiennent à la même organisation. - Ajouter des
contraintes uniques composites tenant-aware. - Utiliser PostgreSQL Row
Level Security comme défense en profondeur. - Tester explicitement les
tentatives d'accès croisé entre tenants.

Un utilisateur peut appartenir à plusieurs organisations via
`memberships`. L'organisation active est sélectionnée dans une
session/contexte validé côté serveur.

## 6.2 Tables principales

### Identité et organisations

-   `organizations`: id, name, slug, country, currency, timezone,
    status.
-   `users`: id, name, email, password_hash, avatar, status.
-   `memberships`: id, organization_id, user_id, role_id, status.
-   `roles`: id, organization_id, name.
-   `permissions`: id, key, description.
-   `role_permissions`: role_id, permission_id.
-   `teams`: id, organization_id, name.
-   `team_members`: team_id, user_id.
-   `departments`: id, organization_id, name.
-   `audit_logs`: id, organization_id, actor_user_id, action,
    entity_type, entity_id, metadata.

### Contacts et entreprises

-   `contacts`: id, organization_id, first_name, last_name, email,
    phone, owner_user_id.
-   `companies`: id, organization_id, name, sector, website, address.
-   `contact_companies`: contact_id, company_id, position.
-   `tags`: id, organization_id, name.
-   `contact_tags`: contact_id, tag_id.
-   `contact_notes`: id, organization_id, contact_id, user_id, content.
-   `custom_field_definitions`: id, organization_id, entity_type, key,
    label, field_type, config.
-   `custom_field_values`: id, organization_id, definition_id,
    entity_id, value.

### Prospection et ventes

-   `lead_sources`: id, organization_id, name.
-   `leads`: id, organization_id, contact_id, source_id, status, score,
    owner_user_id.
-   `pipelines`: id, organization_id, name.
-   `pipeline_stages`: id, organization_id, pipeline_id, name, position,
    probability.
-   `deals`: id, organization_id, contact_id, company_id, pipeline_id,
    stage_id, amount, currency, expected_close_at, owner_user_id.
-   `deal_stage_history`: id, organization_id, deal_id, from_stage_id,
    to_stage_id, changed_by, changed_at.
-   `products`: id, organization_id, name, sku, price, currency, status.
-   `deal_products`: id, organization_id, deal_id, product_id, quantity,
    unit_price.
-   `lost_reasons`: id, organization_id, name.

### Activités

-   `activities`: id, organization_id, type, subject, description,
    owner_user_id, occurred_at.
-   `activity_relations`: id, organization_id, activity_id, entity_type,
    entity_id.
-   `tasks`: id, organization_id, title, status, priority,
    assignee_user_id, due_at.
-   `appointments`: id, organization_id, title, start_at, end_at,
    timezone.
-   `reminders`: id, organization_id, user_id, scheduled_at, status.

### Devis et facturation

-   `quotes`: id, organization_id, contact_id, number, status, currency,
    subtotal, tax_total, total, valid_until.
-   `quote_items`: id, organization_id, quote_id, description, quantity,
    unit_price, tax_rate.
-   `invoices`: id, organization_id, contact_id, quote_id, number,
    status, currency, subtotal, tax_total, total, due_at.
-   `invoice_items`: id, organization_id, invoice_id, description,
    quantity, unit_price, tax_rate.
-   `payments`: id, organization_id, invoice_id, amount, currency,
    provider, provider_reference, status.
-   `tax_rates`: id, organization_id, name, rate.

### Marketing et consentements

-   `campaigns`: id, organization_id, name, channel, status,
    scheduled_at.
-   `segments`: id, organization_id, name, definition.
-   `campaign_recipients`: id, organization_id, campaign_id, contact_id,
    delivery_status.
-   `email_templates`: id, organization_id, name, subject, content.
-   `message_events`: id, organization_id, campaign_id, recipient_id,
    event_type, occurred_at.
-   `consent_records`: id, organization_id, contact_id, purpose,
    channel, status, source, recorded_at.
-   `suppression_records`: id, organization_id, contact_id, channel,
    reason.

### Support

-   `tickets`: id, organization_id, contact_id, subject, status,
    priority, assignee_user_id.
-   `ticket_messages`: id, organization_id, ticket_id, author_user_id,
    body, visibility.
-   `ticket_assignments`: id, organization_id, ticket_id, user_id.
-   `ticket_categories`: id, organization_id, name.
-   `knowledge_articles`: id, organization_id, title, content, status.
-   `satisfaction_surveys`: id, organization_id, ticket_id, rating,
    comment.

### Automatisations

-   `workflows`: id, organization_id, name, status, current_version_id.
-   `workflow_versions`: id, organization_id, workflow_id, version,
    definition.
-   `workflow_executions`: id, organization_id, workflow_id, status,
    started_at, finished_at.
-   `workflow_step_executions`: id, organization_id, execution_id,
    step_key, status, output.
-   `workflow_logs`: id, organization_id, execution_id, level, message.
-   `webhook_endpoints`: id, organization_id, url, secret_encrypted,
    status.

### IA

-   `ai_provider_configs`: id, organization_id, provider, model,
    encrypted_config.
-   `ai_conversations`: id, organization_id, user_id, title.
-   `ai_messages`: id, organization_id, conversation_id, role, content,
    metadata.
-   `ai_usage`: id, organization_id, user_id, provider, model,
    input_tokens, output_tokens, cost.
-   `ai_knowledge_sources`: id, organization_id, source_type, source_id,
    status.

### SaaS

-   `plans`: id, name, billing_interval, price, currency, status.
-   `plan_features`: id, plan_id, feature_key, limit_value.
-   `subscriptions`: id, organization_id, plan_id, status,
    current_period_start, current_period_end.
-   `subscription_events`: id, organization_id, subscription_id,
    event_type, payload.
-   `saas_invoices`: id, organization_id, number, amount, currency,
    status.
-   `saas_payments`: id, organization_id, invoice_id, provider,
    reference, status.
-   `usage_records`: id, organization_id, metric, quantity,
    period_start, period_end.
-   `coupons`: id, code, discount_type, discount_value, expires_at.

### RH opérationnelles

-   `employee_profiles`: id, organization_id, user_id, department_id,
    job_title.
-   `performance_goals`: id, organization_id, user_id, metric, target,
    period.
-   `performance_records`: id, organization_id, user_id, metric, value,
    recorded_at.
-   `leave_types`: id, organization_id, name.
-   `leave_requests`: id, organization_id, user_id, leave_type_id,
    start_at, end_at, status.

## 6.3 Conventions de données

-   UUID comme identifiant.
-   `created_at`, `updated_at` sur les entités modifiables.
-   `deleted_at` uniquement pour les entités qui nécessitent une
    suppression logique.
-   Montants en `DECIMAL/NUMERIC` ou unités mineures entières, jamais en
    flottants binaires.
-   Devise enregistrée avec chaque montant.
-   Dates stockées en UTC ; fuseau de l'organisation/utilisateur pour
    l'affichage.
-   Index sur `organization_id`, clés étrangères, dates de recherche et
    champs filtrés.
-   Unicité tenant-aware, par exemple
    `(organization_id, email_normalized)` lorsque la règle métier
    l'autorise.
-   Transactions pour les opérations financières et conversions de
    devis.
-   Historique non destructif pour les paiements et événements
    critiques.
-   Fichiers stockés dans un stockage objet, références et métadonnées
    en base.
-   Migrations versionnées et données de démonstration séparées.

Les champs exacts, nullabilités, cardinalités et contraintes seront
précisés dans l'ERD et le schéma Prisma avant développement des modules.

------------------------------------------------------------------------

# 7. API et intégrations

## 7.1 API REST

Préfixe : `/api/v1`.

Exemples :

``` text
POST   /auth/register
POST   /auth/login
POST   /auth/refresh
POST   /auth/logout

GET    /organizations/current
GET    /contacts
POST   /contacts
GET    /contacts/:id
PATCH  /contacts/:id
DELETE /contacts/:id

GET    /leads
POST   /leads
GET    /deals
POST   /deals
GET    /pipelines

GET    /tasks
POST   /tasks
GET    /campaigns
POST   /campaigns
GET    /tickets
POST   /tickets

GET    /quotes
POST   /quotes
GET    /invoices
POST   /invoices
POST   /payments

GET    /workflows
POST   /workflows
POST   /ai/conversations
POST   /ai/conversations/:id/messages

GET    /analytics/overview
GET    /subscriptions/current
```

Conventions : - Pagination par curseur pour les grandes collections
lorsque pertinent. - Filtres et tri validés côté serveur. - Réponses et
erreurs normalisées. - Codes HTTP cohérents. - Versionnement de l'API. -
Validation des entrées. - Rate limiting et quotas. - Idempotency-Key
pour les opérations sensibles. - Swagger/OpenAPI maintenu avec le
code. - Permissions contrôlées sur chaque endpoint.

## 7.2 Connecteurs

Prévoir des adaptateurs isolés pour : - E-mail : SMTP, Resend ou
fournisseur équivalent. - WhatsApp : WhatsApp Business Platform via
fournisseur officiel. - SMS : fournisseur selon pays. - Calendriers :
Google Calendar et Microsoft Outlook. - Publicité/leads : Facebook Lead
Ads. - Paiements : Stripe et prestataires locaux compatibles Mobile
Money. - IA : fournisseurs interchangeables. - Webhooks et intégrations
n8n.

Ne pas supposer qu'un fournisseur est disponible dans tous les pays.
Vérifier pays, tarifs, limites, exigences d'approbation et conditions
d'utilisation avant activation.

------------------------------------------------------------------------

# 8. Sécurité, confidentialité et conformité

## 8.1 Authentification

-   Inscription et vérification d'e-mail.
-   Connexion et déconnexion.
-   Réinitialisation sécurisée du mot de passe.
-   MFA/2FA.
-   Sessions et révocation.
-   OAuth social en option.
-   Protection contre brute force et credential stuffing.

## 8.2 Autorisations

RBAC avec permissions granulaires, par exemple : - `contacts.view`,
`contacts.create`, `contacts.update`, `contacts.delete` - `deals.view`,
`deals.manage` - `invoices.view`, `invoices.create` - `users.manage`,
`reports.view`

Compléter le RBAC par des règles de portée : propriétaire, équipe,
département ou organisation.

## 8.3 Sécurité des données

-   HTTPS partout.
-   Hash de mot de passe robuste.
-   Chiffrement des secrets et tokens d'intégration.
-   Gestion sûre des clés et variables d'environnement.
-   Protection XSS, CSRF, SSRF et injections.
-   Contrôle des fichiers téléversés et antivirus si nécessaire.
-   Journal d'audit.
-   Sauvegardes chiffrées et tests de restauration.
-   Politique de rétention.
-   Export et suppression des données personnelles.
-   Surveillance des accès et alertes.

## 8.4 Conformité

Concevoir les mécanismes nécessaires au respect des lois applicables
selon les pays : protection des données, communications commerciales,
conservation des documents et facturation. Le RGPD s'applique lorsque
son champ d'application est rempli ; les obligations locales doivent
être examinées avec un conseil compétent.

------------------------------------------------------------------------

# 9. UX/UI et design system

## 9.1 Direction artistique

Interface professionnelle, premium, moderne, claire, accessible et
responsive. Prévoir thème clair/sombre et design system cohérent.

## 9.2 Navigation

-   Dashboard.
-   Contacts.
-   Prospects.
-   Entreprises.
-   Ventes / pipelines.
-   Activités et calendrier.
-   Marketing.
-   Support.
-   Produits et facturation.
-   Automatisations.
-   Assistant IA.
-   Équipes.
-   Rapports.
-   Intégrations.
-   Paramètres.

Les éléments de navigation sont affichés selon les modules souscrits et
les permissions.

## 9.3 Composants

-   Tables avec pagination, filtres, tri et vues sauvegardées.
-   Formulaires avec validation et autosauvegarde si adaptée.
-   Kanban.
-   Timeline.
-   Graphiques.
-   Modales et panneaux latéraux.
-   Recherche globale et palette de commandes.
-   Notifications et états vides.
-   États de chargement, erreur et succès.
-   Accessibilité clavier et contrastes suffisants.

## 9.4 Internationalisation

-   Français initialement.
-   Architecture i18n prête pour anglais et autres langues.
-   Formats de date, nombre, devise et fuseau localisés.
-   Traductions séparées du code.
-   Pas de devise ou de format monétaire codé en dur.

------------------------------------------------------------------------

# 10. Exigences non fonctionnelles

## Performance

-   Pagination serveur obligatoire sur les listes volumineuses.
-   Indexation et analyse des requêtes lentes.
-   Cache uniquement lorsque la cohérence le permet.
-   Traitements lourds en arrière-plan.
-   Limites de taille et de débit.
-   Optimisation des dashboards et exports.

## Disponibilité et résilience

-   Health checks.
-   Redémarrage contrôlé des workers.
-   Retries avec backoff.
-   Dead-letter queue pour tâches échouées.
-   Timeouts et circuit breakers sur intégrations.
-   Sauvegardes et procédures de restauration.
-   Plan de reprise documenté.

## Observabilité

-   Logs structurés avec correlation ID.
-   Monitoring des API, DB, Redis et workers.
-   Suivi erreurs frontend et backend.
-   Métriques de latence, taux d'erreur et queues.
-   Alertes opérationnelles.
-   Éviter d'inscrire des données personnelles ou secrets dans les logs.

## Qualité

-   Tests unitaires, intégration et end-to-end.
-   Tests d'isolation tenant.
-   Tests RBAC.
-   Tests de transactions financières.
-   Tests de synchronisation mobile.
-   Analyse statique, lint et formatage.
-   Revue de code et migrations contrôlées.

------------------------------------------------------------------------

# 11. Plan de développement

Les durées sont indicatives et supposent des ressources suffisantes. Les
phases peuvent se chevaucher après stabilisation des fondations.

  ------------------------------------------------------------------------
  Phase                 Périmètre                               Estimation
  --------------------- --------------------- ----------------------------
  0                     Découverte, règles                      2 semaines
                        métier, UX/UI,        
                        architecture          

  1                     Monorepo, CI,                           3 semaines
                        environnements, auth, 
                        multi-tenant, RBAC    

  2                     Contacts,                               3 semaines
                        entreprises,          
                        import/export, leads  

  3                     Pipelines, deals,                       3 semaines
                        activités et tâches   

  4                     Produits, devis,                        3 semaines
                        factures, paiements   

  5                     Marketing,                              3 semaines
                        consentements et      
                        e-mails               

  6                     Support et tickets                      2 semaines

  7                     Workflows et workers                    3 semaines

  8                     IA et connecteurs                       2 semaines

  9                     RH opérationnelles et                   2 semaines
                        analytics avancés     

  10                    Application mobile et                   4 semaines
                        synchronisation       

  11                    Durcissement                            3 semaines
                        sécurité, QA,         
                        performance et        
                        lancement             
  ------------------------------------------------------------------------

Estimation indicative : environ 33 semaines. Le calendrier réel dépend
de l'équipe, des intégrations, du niveau de finition et des validations
métier.

## 11.1 Version Alpha

-   Authentification.
-   Organisations et membres.
-   RBAC.
-   Contacts et entreprises.
-   Leads.
-   Pipelines et deals.
-   Tâches.
-   Dashboard de base.

## 11.2 Version Beta

-   Devis et factures.
-   Campagnes e-mail.
-   Support.
-   Abonnements SaaS.
-   Automatisations initiales.
-   Équipes et objectifs.
-   Tests avec plusieurs entreprises pilotes.

## 11.3 Version 1.0

-   Assistant IA.
-   Application mobile.
-   Connecteurs prioritaires.
-   Analytics avancés.
-   Documentation.
-   Monitoring et sauvegardes.
-   Processus de support et de commercialisation.

------------------------------------------------------------------------

# 12. Tests et critères d'acceptation

## Tests obligatoires

-   Authentification et récupération de compte.
-   Accès multi-organisation.
-   Isolation complète entre tenants.
-   Permissions par rôle et portée.
-   CRUD de chaque domaine.
-   Import/export avec erreurs partielles.
-   Conversion lead vers deal.
-   Déplacement et historique de pipeline.
-   Calculs de devis/factures et paiements partiels.
-   Idempotence des webhooks.
-   Désinscription et suppression des audiences.
-   Exécutions, retries et boucles de workflows.
-   Permissions appliquées aux outils IA.
-   Notifications et synchronisation mobile.

## Critères de sortie

-   Aucune fuite de données entre organisations dans les tests.
-   Aucun endpoint métier sans contrôle d'accès.
-   Transactions financières cohérentes.
-   Migrations reproductibles.
-   Sauvegarde restaurée avec succès en test.
-   API documentée.
-   Tests automatisés sur les fonctions critiques.
-   Gestion des erreurs et logs opérationnels.
-   Applications web et mobile utilisables sur les appareils ciblés.

------------------------------------------------------------------------

# 13. Livrables

1.  Dépôt source versionné.
2.  Application web React.
3.  Application mobile React Native/Expo.
4.  API NestJS.
5.  Workers BullMQ.
6.  Schéma Prisma et migrations.
7.  Diagramme ERD.
8.  Documentation OpenAPI/Swagger.
9.  Design system et maquettes validées.
10. Authentification et RBAC.
11. Architecture multi-tenant.
12. Modules fonctionnels.
13. Connecteurs documentés.
14. Tests automatisés.
15. Configuration Docker.
16. CI/CD.
17. Fichier `.env.example` sans secret.
18. Documentation d'installation.
19. Documentation utilisateur.
20. Procédures de sauvegarde, restauration et déploiement.

------------------------------------------------------------------------

# 14. Directives d'exécution pour Claude Code

Claude Code doit agir comme un ingénieur logiciel senior et respecter
les consignes suivantes.

## 14.1 Avant de coder

1.  Lire intégralement ce cahier des charges.
2.  Inspecter le dépôt existant avant toute modification.
3.  Identifier les technologies, conventions et fichiers déjà présents.
4.  Signaler les décisions ambiguës et proposer des choix.
5.  Produire un plan d'implémentation et les diagrammes nécessaires.
6.  Ne pas écraser ou supprimer des fichiers existants sans
    justification et validation.
7.  Ne pas inventer de clés API, secrets ou identifiants de
    fournisseurs.

## 14.2 Ordre de travail impératif

1.  Architecture du monorepo et conventions.
2.  Modèle de données et ERD.
3.  Schéma Prisma, migrations et seed de développement.
4.  Authentification, organisations et memberships.
5.  Contexte tenant, isolation et RBAC.
6.  Tests de sécurité multi-tenant.
7.  API et frontend de base.
8.  Modules métier par lots validés.
9.  Workers, intégrations et automatisations.
10. Application mobile.
11. Observabilité, sécurité, documentation et déploiement.

## 14.3 Règles d'implémentation

-   TypeScript strict.
-   Pas de logique métier dans les composants UI.
-   Pas d'accès direct à la base depuis le frontend.
-   DTO et validation côté API.
-   Vérification tenant et permissions côté serveur.
-   Transactions pour opérations multi-écritures critiques.
-   Tests pour chaque règle métier importante.
-   Gestion cohérente des erreurs.
-   Pas de données fictives en production.
-   Pas de secrets dans Git.
-   Pas de fonctionnalité affichée comme opérationnelle si son backend
    n'existe pas.
-   Ne pas remplacer un vrai connecteur par une simulation sans
    l'indiquer clairement.
-   Documenter les décisions d'architecture (ADR).
-   Mettre à jour le README à chaque évolution structurante.

## 14.4 Travail par étapes

Pour chaque phase : 1. Décrire les fichiers et changements prévus. 2.
Implémenter un périmètre limité. 3. Exécuter lint, vérification
TypeScript et tests. 4. Corriger les régressions. 5. Mettre à jour la
documentation. 6. Résumer ce qui fonctionne, ce qui reste et les
risques. 7. Attendre validation avant de passer à une phase structurante
suivante.

## 14.5 Definition of Done

Une fonctionnalité est terminée uniquement si : - L'interface est
utilisable et responsive. - L'API et les validations fonctionnent. - Les
permissions sont vérifiées. - L'isolation tenant est testée. - Les états
chargement/vide/erreur sont gérés. - Les tests pertinents passent. - La
documentation est à jour. - Les limites ou dépendances externes sont
signalées.

------------------------------------------------------------------------

# 15. Décisions restant à confirmer

Avant le lancement commercial, préciser : - Nom de marque et identité
visuelle. - Pays prioritaires et exigences légales. - Plans, prix,
essais et limites. - Fournisseurs de paiement par marché. - Fournisseurs
e-mail, SMS et WhatsApp. - Politique de conservation et résidence des
données. - Politique de sauvegarde et objectifs RPO/RTO. - Niveau exact
du mode hors connexion mobile. - Périmètre RH. - Règles fiscales et
modèles de factures par pays. - Politique d'accès du support SaaS aux
espaces clients.

------------------------------------------------------------------------

# 16. Première mission à confier à Claude Code

**Ne pas développer immédiatement tous les modules.**

Commencer par une phase d'analyse et de fondations :

1.  Inspecter le dépôt et proposer l'arborescence du monorepo.
2.  Définir les diagrammes d'architecture et ERD.
3.  Définir le modèle multi-tenant et les règles RBAC.
4.  Produire le premier schéma Prisma cohérent.
5.  Définir les migrations initiales.
6.  Implémenter l'authentification, les organisations et les
    memberships.
7.  Mettre en place les tests prouvant qu'un utilisateur d'une
    organisation ne peut jamais lire ou modifier les données d'une
    autre.
8.  Livrer un rapport d'implémentation et les commandes de lancement
    local.

**Livrable de cette première mission :** un socle technique exécutable,
documenté, testé et sécurisé, prêt à accueillir les modules CRM.

------------------------------------------------------------------------

**Fin du cahier des charges --- CRM SaaS V1.0**\
Document de référence fonctionnel, technique et opérationnel.
