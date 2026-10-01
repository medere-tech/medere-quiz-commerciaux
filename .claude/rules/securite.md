---
paths:
  - "firestore.rules"
  - "functions/**/*.ts"
  - "src/app/api/**/*.ts"
  - "src/lib/firebase/**/*.ts"
---

# Sécurité

## Autorisation

Le rôle administrateur est un **custom claim Firebase**, posé côté serveur par le SDK Admin à partir d'une liste d'adresses en variable d'environnement.

Ne jamais utiliser un champ Firestore pour autoriser. Un `users/{uid}.isAdmin` est modifiable par le client dès qu'une règle d'écriture est mal calibrée. Le champ `role` du document utilisateur existe pour l'affichage, jamais pour la décision d'accès.

Après attribution d'un claim, la valeur n'apparaît dans les règles qu'au rafraîchissement du jeton d'identité — jusqu'à une heure. Forcer `getIdToken(true)` ou demander une reconnexion.

## Isolation des scores

`users/{uid}/reponses` est lisible et modifiable **par son seul propriétaire**. Aucune exception administrateur, aucune requête de groupe de collections qui contournerait la règle.

Les taux par question se calculent côté serveur, à partir des états des commerciaux, agrégés sans identifiant (`agregerEtats`, `src/lib/serveur/maitrise-equipe.ts`). Ce qui en sort est un total par question, jamais une ligne par personne : l'affichage reste anonyme. La maîtrise nominative est réservée à l'équipe pédagogique, par le serveur, depuis la décision du 30 septembre 2026. Toute autre fonctionnalité qui exigerait de savoir qui a raté quoi : s'arrêter et le signaler, c'est un changement de politique, pas un détail d'implémentation.

## Secrets

Aucune clé côté navigateur. Le jeton Airtable et les clés de service ne quittent pas le serveur. Tout appel qui en a besoin passe par une route serveur.

`.env.local` n'est jamais committé. Vérifier le `.gitignore` avant le premier commit.

## Règles Firestore

Versionnées, testées avec l'émulateur, jamais en mode test même temporairement. Les routes `/admin` sont vérifiées côté serveur, une redirection côté client n'est pas une protection.
