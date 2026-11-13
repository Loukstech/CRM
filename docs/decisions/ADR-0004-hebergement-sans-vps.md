# ADR-0004 — Hébergement sans VPS : services managés

- **Statut :** orientation acceptée (2026-11-13) ; **choix des fournisseurs à confirmer**
- **Contexte :** le cahier (§5.1, §13) suppose Docker. Vous ne disposez pas de VPS, et la machine
  de développement n'a ni Docker ni PostgreSQL.

## Décision

1. L'application ne dépend d'aucun service auto-hébergé. Chaque brique d'infrastructure doit avoir
   une offre managée.
2. Docker devient **optionnel** : aucun fichier Docker n'est livré en phase 1, parce qu'il n'aurait
   pas pu être testé ici. Il sera ajouté si la cible retenue l'exige.
3. Le développement local utilise un PostgreSQL embarqué ([ADR-0005](ADR-0005-postgresql-embarque.md)).

## Ce que l'architecture garantit déjà

| Besoin d'un hébergement managé | Réponse dans le code |
| --- | --- |
| Pooler de connexions en mode transaction | Contexte tenant posé par transaction, jamais par session |
| Connexion distincte pour les migrations | `DATABASE_MIGRATION_URL` (`directUrl` Prisma) |
| Rôle d'exécution non privilégié | Créé par la migration ; vérifié au démarrage |
| Configuration par variables d'environnement | Validée au démarrage, aucun fichier requis en production |
| Sondes de santé | `/api/v1/health/live` et `/ready` |

## Points à vérifier avant de choisir (non vérifiés à ce jour)

- **API :** l'offre doit exécuter un processus Node.js ≥ 22 **permanent**. Une offre « serverless »
  ou qui met le processus en veille ne convient pas en l'état (limitation de débit en mémoire,
  futurs workers et temps réel).
- **PostgreSQL géré :** pouvoir créer un rôle sans `BYPASSRLS`. Chez certains fournisseurs, les
  rôles créés depuis la console héritent de privilèges étendus ; le rôle `crm_app` doit être créé
  en SQL (ce que fait la migration) et son mot de passe attribué ensuite.
- **Phase 7 (tâches de fond) :** Redis managé + BullMQ, ou une file reposant sur PostgreSQL qui
  évite un service supplémentaire. À trancher à ce moment-là, selon l'hébergeur.
- **Plusieurs instances d'API :** impossible tant que la limitation de débit est en mémoire.

## Conséquence

Aucun déploiement n'a été réalisé. Le premier déploiement fait partie de la phase 1b et commencera
par la validation des trois premiers points ci-dessus sur le fournisseur choisi.
