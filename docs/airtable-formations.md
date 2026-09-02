# Contrat d'interface Airtable — table Formations

Relevé le 1er septembre 2026 depuis le schéma de la base.

**Tout l'accès se fait par identifiants, jamais par noms.** Un nom de table ou de champ se renomme d'un clic dans Airtable, et l'application casse en silence sans qu'aucun test ne le détecte. Les identifiants `tbl...` et `fld...` sont immuables.

## Coordonnées

| Élément | Identifiant |
|---|---|
| Base | `app3GnMOzJn7VHMji` (« Médéré ») |
| Table | `tblu6nfUIhTQ1cbgk` (« Formations ») |

## Appel API

Toujours avec `returnFieldsByFieldId=true`. La réponse est alors indexée par identifiant de champ, et le renommage d'un champ côté Airtable n'a plus aucun effet sur l'application.

```
GET https://api.airtable.com/v0/{baseId}/{tableId}?returnFieldsByFieldId=true
Authorization: Bearer {AIRTABLE_TOKEN}
```

L'identifiant d'enregistrement natif (`rec...`) renvoyé par l'API sert de clé de rapprochement vers Firestore. Le champ formule `record_id` de la table fait doublon avec lui : ne pas l'utiliser.

## Champs lus

| Champ Firestore | Identifiant Airtable | Nom actuel | Type Airtable | Remarque |
|---|---|---|---|---|
| `airtableId` | — | — | — | Identifiant natif `rec...` de l'enregistrement |
| `numeroActionDpc` | `fldpQPNVftoz4y8Ws` | Numéro d'action DPC | Texte | Champ primaire, identifiant métier |
| `nom` | `fldo62rbDD2trd7Jg` | Nom de la formation | Texte | |
| `cibles` | `fld8TIxjDWBvTvTvX` | Public concerné | **Sélection multiple** | **Tableau de chaînes**, jamais une chaîne seule |
| `format` | `fldhfMBFvr9PoB70E` | Format | Sélection simple | |
| `modalite` | `fldZUclOnuicRTQe9` | Modalité pédagogique | Sélection simple | |
| `statutSource` | `fld3NuuufLPPf3LgZ` | Statut de la formation | Sélection simple | Détermine `actif` côté Firestore |
| `blocsCertification` | `fldSzpTM9bOG4pp66` | Bloc/Axe certification | **Sélection multiple** | Tableau. Voir plus bas |
| `dureeTotale` | `fldSNZuA8JL91b3wA` | Durée totale | Texte | |
| `urlWebflow` | `fld9C15oF7RVDEVyO` | URL Webflow | URL | Utile pour un lien vers la fiche publique |

## Champs volontairement ignorés

`Prix`, `Indemnisation`, `Sessions`, `Devis`, `webflow_id`, les durées EPP et les colonnes `Sessions 2/3/4`. Hors périmètre de l'entraînement. Ne pas les lire : moins on lit, moins on expose.

## Modèle Firestore corrigé

```
formations/{formationId}
  airtableId : string
  numeroActionDpc : string
  nom : string
  cibles : string[]              // sélection multiple, pas une chaîne
  format : string
  modalite : string
  blocsCertification : string[]
  dureeTotale : string
  urlWebflow : string
  actif : boolean
  syncLe : timestamp
```

Ceci remplace la définition de `formations` donnée en section 3 du README, qui prévoyait un champ `cible` au singulier.

## Statut et désactivation

Une formation absente de la réponse Airtable, ou dont le statut source indique qu'elle n'est plus proposée, passe à `actif: false`. **Jamais de suppression** : des questions y sont rattachées, et supprimer le document casserait leur affichage.

Une formation inactive n'apparaît plus dans la liste de rattachement du back-office, mais les questions déjà rattachées continuent de fonctionner.

## Le champ « Bloc/Axe certification »

Faits constatés, sans interprétation.

Le champ est une sélection multiple. **Ses options réelles sont `1`, `2`, `3` et `4`.** Sa description dans Airtable, en revanche, évoque des blocs MG, GO, PED et des axes CD, PSY — la description et les options ne coïncident pas. Ce sont les options qui font foi, puisque ce sont elles que l'API renvoie.

Le champ est lu et stocké tel quel dans `blocsCertification`. **Aucune logique applicative ne doit s'appuyer dessus.**

En particulier, ne pas en déduire que deux formations partageant un bloc constituent un enchaînement commercial. Rien ne l'établit. Les liens entre formations sont une question métier qui relève de Noémie : c'est elle qui les exprime en rattachant explicitement une question à plusieurs formations. L'application n'infère aucune relation.

Si de nouvelles options apparaissent, elles sont stockées telles quelles sans traitement particulier. Ce champ n'a aucune valeur bloquante.
