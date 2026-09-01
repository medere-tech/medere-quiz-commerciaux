---
paths:
  - "src/app/api/airtable/**/*.ts"
  - "src/lib/airtable/**/*.ts"
---

# Airtable — lecture seule

La base Airtable est pilotée par des automatisations **en production**. Une écriture inattendue casse le travail d'autres personnes.

## Interdit

Toute écriture, création, mise à jour ou suppression d'enregistrement Airtable. Aucune exception. Si un besoin semble l'exiger, s'arrêter et le signaler à Déthié plutôt que de contourner.

## Le jeton

Scopes autorisés : `data.records:read` et `schema.bases:read`, rien d'autre. Accès restreint à la seule base formations. Ainsi configuré, le jeton n'a pas la capacité technique d'écrire — ne pas ajouter de scope pour « simplifier ».

Les jetons Airtable n'expirent pas. En cas de 401 ou 403, la cause est un scope manquant ou une base non accordée, pas une expiration.

Le jeton s'envoie dans l'en-tête `Authorization: Bearer`, jamais en paramètre d'URL.

## Synchronisation

Vers `formations` uniquement, dans ce sens et jamais l'inverse. Rapprochement par `airtableId`. Les formations disparues passent à `actif: false` — **jamais de suppression**, des questions y sont rattachées.

Mise en cache obligatoire. Le catalogue évolue à la semaine, une revalidation toutes les six heures suffit. Ne pas appeler l'API à chaque chargement de page.
