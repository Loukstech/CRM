# ADR-0003 — Authentification : JWT court + session serveur + rotation du jeton de rafraîchissement

- **Statut :** accepté (2026-11-13) ; transport côté web **à confirmer**
- **Contexte :** cahier §8.1 (sessions et révocation, protection contre la force brute), §2.4 (web et mobile sur la même API).

## Décision

- Jeton d'accès JWT HS256 de 15 minutes portant `sub`, `sid` (session) et `org` (organisation active).
- **Chaque requête** revalide en base la session, le compte, l'appartenance et les permissions :
  révocation et changement de rôle sont immédiats. Le JWT évite seulement une recherche par jeton
  opaque et garantit l'intégrité des revendications.
- Jeton de rafraîchissement opaque, stocké haché, à usage unique ; un rejeu révoque la session.
- Mots de passe en Argon2id ; verrouillage après 5 échecs ; limitation de débit par IP.
- Bibliothèque `@nestjs/jwt` et garde maison plutôt que Passport : une seule stratégie, moins de code implicite.

## Compromis assumés

- Deux requêtes SQL par appel d'API. Un cache court (quelques secondes) sera envisagé après mesure,
  au prix d'une révocation légèrement différée.
- Deux rafraîchissements simultanés avec le même jeton sont traités comme un rejeu et révoquent la
  session : un client doit sérialiser ses rafraîchissements.
- Le verrouillage de compte permet à un tiers de bloquer temporairement un compte dont il connaît
  l'e-mail (15 minutes). La réinitialisation du mot de passe lève le verrouillage.
- L'inscription révèle qu'un e-mail est déjà utilisé (réponse 409).

## Reste à décider

Pour l'application web, le jeton de rafraîchissement devrait voyager dans un cookie `httpOnly`,
`Secure`, `SameSite`, avec protection CSRF, plutôt que d'être manipulé par le JavaScript. Le mobile
garde le transport par corps de requête et un stockage sécurisé de l'appareil.
