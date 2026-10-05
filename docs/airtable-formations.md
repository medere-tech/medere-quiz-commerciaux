# Contrat d'interface Airtable — table Formations

Relevé le 1er septembre 2026 depuis le schéma de la base. Complété le 5 octobre 2026 : table Sujets, champs « Sujet » et « Nom du sujet », renommage et nouvelles options de « Blocs Certification ». Le même jour, la synchronisation lit le sujet de chaque fiche et la table Sujets, et ne demande plus que les champs du contrat.

**Tout l'accès se fait par identifiants, jamais par noms.** Un nom de table ou de champ se renomme d'un clic dans Airtable, et l'application casse en silence sans qu'aucun test ne le détecte. Les identifiants `tbl...` et `fld...` sont immuables.

## Coordonnées

| Élément | Identifiant |
|---|---|
| Base | `app3GnMOzJn7VHMji` (« Médéré ») |
| Table | `tblu6nfUIhTQ1cbgk` (« Formations ») |
| Table | `tblCtvmk1cpRhCJwB` (« Sujets ») |

## Appel API

Toujours avec `returnFieldsByFieldId=true`. La réponse est alors indexée par identifiant de champ, et le renommage d'un champ côté Airtable n'a plus aucun effet sur l'application.

```
GET https://api.airtable.com/v0/{baseId}/{tableId}?returnFieldsByFieldId=true&fields[]=fld…&fields[]=fld…
Authorization: Bearer {AIRTABLE_TOKEN}
```

**Toujours avec la liste `fields[]` des champs du contrat**, et eux seuls (`CHAMPS` et `CHAMPS_SUJET` dans `src/lib/airtable/contrat.ts`). Sans elle, Airtable renvoie toutes les colonnes de l'enregistrement : jusqu'au 5 octobre 2026, la synchronisation recevait ainsi Prix, Devis et Indemnisation, ignorés à la conversion mais transmis quand même au serveur. `tests/airtable/client.test.ts` vérifie l'adresse réellement demandée.

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
| `blocsCertification` | `fldSzpTM9bOG4pp66` | Blocs Certification | **Sélection multiple** | Tableau. Ex-« Bloc/Axe certification ». Voir plus bas |
| `dureeTotale` | `fldSNZuA8JL91b3wA` | Durée totale | Texte | |
| `urlWebflow` | `fld9C15oF7RVDEVyO` | URL Webflow | URL | Utile pour un lien vers la fiche publique |
| `sujetId` | `fldzkVLwScvgvDmlq` | Sujet | Lien vers Sujets | `rec…` ou `null`. Voir « La table Sujets » |

## Champs volontairement ignorés

`Prix`, `Indemnisation`, `Sessions`, `Devis`, `webflow_id`, les durées EPP et les colonnes `Sessions 2/3/4`. Hors périmètre de l'entraînement. Ne pas les lire : moins on lit, moins on expose. **Depuis le 5 octobre 2026, ils ne sont plus demandés du tout** (liste `fields[]`) ; avant, ils arrivaient et étaient ignorés.

« Nom du sujet » (`fldWnTXMH3bsdUQbx`), le champ de recherche, est aussi ignoré : le nom vient de la table Sujets, sa source. Voir plus bas.

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
  sujetId : string | null        // `rec…` de son sujet ; obligatoire, `null` s'il n'en a pas
  actif : boolean
  syncLe : timestamp

sujets/{airtableId}              // miroir de la table Sujets, écrit par la synchronisation
  airtableId : string
  nom : string
  actif : boolean                // faux quand le sujet a disparu d'Airtable
  syncLe : timestamp

presentations/{sujetId}          // saisi au back-office, jamais touché par la synchronisation
  url : string                   // https, docs.google.com ou drive.google.com, 500 au plus
  presenteeLe : timestamp        // date de la présentation à l'équipe
  presentePar : string           // nom du jeton de l'auteur, vérifié par les règles
  majLe : timestamp
```

**Pourquoi `presentations/` est à part de `sujets/`.** La synchronisation écrit `formations/` et `sujets/` par un `set` complet, sans fusion, chaque nuit à 4 h. Tout champ saisi dans le back-office sur l'un de ces documents serait effacé au passage suivant. Une collection à part, indexée par l'identifiant `rec…` du sujet, n'est jamais touchée par la synchronisation et survit au renommage du sujet. `tests/serveur/sujets.test.ts` le vérifie.

Ceci remplace la définition de `formations` donnée en section 3 du README, qui prévoyait un champ `cible` au singulier.

## Statut et désactivation

Une formation absente de la réponse Airtable, ou dont le statut source indique qu'elle n'est plus proposée, passe à `actif: false`. **Jamais de suppression** : des questions y sont rattachées, et supprimer le document casserait leur affichage.

Une formation inactive n'apparaît plus dans la liste de rattachement du back-office, mais les questions déjà rattachées continuent de fonctionner.

## Le champ « Blocs Certification »

Faits constatés, sans interprétation.

Le champ s'appelait « Bloc/Axe certification » au relevé du 1er septembre ; il a été renommé depuis. Son identifiant n'a pas bougé, et l'application, qui lit par identifiant, n'a rien vu — c'est exactement ce que la règle d'accès par identifiant protège.

Le champ est une sélection multiple. **Ses options réelles sont, au 5 octobre 2026, `Bloc 1`, `Bloc 2`, `Bloc 3` et `Bloc 4`** — elles valaient `1` à `4` au 1er septembre. Les valeurs synchronisées changent donc de forme à la prochaine synchronisation. `libelleBloc` (`src/lib/import/modele.ts`) n'ajoute « Bloc » qu'à un nombre nu : les deux formes donnent le même libellé, rien ne casse — par chance, pas par conception (voir README, section 3) : simplifié en préfixe inconditionnel, il produirait « Bloc Bloc 1 ». Sa description dans Airtable, en revanche, évoque des blocs MG, GO, PED et des axes CD, PSY — la description et les options ne coïncident pas. Ce sont les options qui font foi, puisque ce sont elles que l'API renvoie.

Le champ est lu et stocké tel quel dans `blocsCertification`. **Aucune logique applicative ne doit s'appuyer dessus.**

En particulier, ne pas en déduire que deux formations partageant un bloc constituent un enchaînement commercial. Rien ne l'établit. Les liens entre formations sont une question métier qui relève de Noémie : c'est elle qui les exprime en rattachant explicitement une question à plusieurs formations. L'application n'infère aucune relation.

Si de nouvelles options apparaissent, elles sont stockées telles quelles sans traitement particulier. Ce champ n'a aucune valeur bloquante.

## La table Sujets

Relevée le 5 octobre 2026, **lue par la synchronisation depuis le même jour.** Elle lit le lien `fldzkVLwScvgvDmlq` sur chaque fiche, puis la table Sujets pour le nom, et fait la jointure côté serveur (`rattacherAuxSujets`, `src/lib/airtable/conversion.ts`) :

- une fiche dont le sujet n'a pas été lu — rejeté, ou absent de la table — reste au catalogue **sans sujet**, et le compte rendu la nomme (`sujetsIntrouvables`) : un lien vers une page qui n'existe pas serait pire que pas de lien ;
- une fiche liée à **deux** sujets est rejetée et signalée, jamais tranchée au profit du premier ;
- un sujet disparu d'Airtable passe à `actif: false`, jamais supprimé ;
- une table Sujets lue **vide** alors que des sujets sont enregistrés interrompt la synchronisation sans rien modifier, comme pour les formations : toutes les fiches perdraient leur sujet d'un coup.

Un sujet regroupe les fiches d'un même thème, qui diffèrent par le format, la modalité ou le public. Chaque formation a **au plus un** sujet : le champ est un lien multiple, mais Airtable y est réglé sur un seul enregistrement (`prefersSingleRecordLink`), et aucune formation n'en porte deux au relevé. La lecture doit pourtant prendre un tableau, puisque c'est ce que l'API renvoie.

| Table | Identifiant | Nom actuel | Type Airtable | Remarque |
|---|---|---|---|---|
| Formations | `fldzkVLwScvgvDmlq` | Sujet | Lien vers Sujets | Tableau d'identifiants `rec...`, un seul en pratique |
| Formations | `fldWnTXMH3bsdUQbx` | Nom du sujet | Recherche (*lookup*) | Lit `fld6Lg70o4ngQ5uBk` à travers le lien. Voir la forme plus bas |
| Sujets | `fld6Lg70o4ngQ5uBk` | Nom du sujet | Texte | Champ primaire |
| Sujets | `fldlDHlV79l6aUx7f` | Formations | Lien vers Formations | Lien inverse de `fldzkVLwScvgvDmlq` |

Les champs `Attachments` et `Attachment Summary` de la table Sujets sont hors périmètre.

### La forme du champ de recherche

« Nom du sujet » (`fldWnTXMH3bsdUQbx`) **n'est pas un tableau de chaînes.** Tel que le relevé l'a lu, il prend cette forme :

```json
{
  "linkedRecordIds": ["recfShm7wzq3fxV7a"],
  "valuesByLinkedRecordId": { "recfShm7wzq3fxV7a": ["COVID"] }
}
```

Chaque identifiant lié renvoie **une liste** de valeurs, pas une valeur seule.

Cette forme a été lue par le connecteur Airtable de l'outil de relevé, pas par l'API REST que la synchronisation appelle. **Vérifié le 5 octobre 2026 par une lecture `GET` sur la vraie base : l'API REST rend des tableaux à plat** — `["COVID"]` pour la recherche, `["recfShm7wzq3fxV7a"]` pour le lien. Un champ de recherche change donc de forme selon l'outil qui le lit, et c'est la raison pour laquelle il n'est pas lu : le lien et la table Sujets suffisent, et ne dépendent d'aucun outil. Si la forme du connecteur arrivait un jour par l'API, la conversion la rejetterait et la signalerait (`tests/airtable/conversion.test.ts`).

### État au 5 octobre 2026, après corrections

- 93 sujets, sans nom en double, tous liés à au moins une formation.
- Les 163 formations actives ont toutes un sujet. Les 14 sans sujet sont les 12 « Suspendue » et les 2 au statut vide.
- Deux corrections faites dans Airtable après le premier relevé : `92622425387` était rattachée au sujet Endométriose au lieu de « Diagnostic et prise en charge des acrosyndromes vasculaires » (décalage d'une ligne au collage), et les deux recyclages AFGSU (`00000000004`, `00000000006`) n'avaient pas de sujet.

## Ce que le relevé impose à la page par sujet

Les faits ci-dessous sont ce sur quoi la maquette a été jugée. La maquette « Médéré Entraînement 8 » dessinait une carte par *format* : elle ne savait pas les afficher. La page construite le 5 octobre 2026 (`src/composants/parcours/PageSujet.tsx`) garde son dessin et étend la carte — le titre de la fiche, sa modalité, son public, sa durée, et le numéro d'action DPC quand il est le seul discriminant. Adaptation validée par Déthié le même jour ; `tests/ecrans/page-sujet.test.tsx` garde chacun des quatre faits.

**42 sujets sur 93 regroupent plusieurs fiches** : 23 en ont deux, 12 en ont trois, 6 en ont quatre, 1 en a six (Troubles du sommeil).

**1. Chaque fiche d'un sujet s'identifie par son titre, pas seulement par son format.** Afficher « E-learning » et « Présentiel » sous le nom du sujet ne suffit pas. Dans un même sujet, les titres diffèrent souvent par le contenu, pas seulement par le format : « HTA : actualisation des connaissances… » à côté de « Hypertension artérielle : appliquer les dernières recommandations… », ou « Troubles du sommeil de l'enfant » à côté de « Les troubles du sommeil ». Le titre de chaque fiche (`nom`) doit rester visible.

**2. Trois axes varient : format, modalité, public.** Sur les 42 sujets à plusieurs fiches :

| Axe qui varie | Sujets |
|---|---|
| Format (`format`) | 31 |
| Modalité (`modalite` : programme intégré, formation continue, test de concordance de script) | 15 |
| Public (`cibles`) | 11 |

Un même sujet peut compter sur plusieurs axes. Combinaisons exactes : format seul 19, format et modalité 8, **public seul 5**, format et public 2, format, modalité et public 2, modalité et public 2, modalité seule 3, aucun des trois 1. Le public n'est pas une exception : il varie dans un sujet à plusieurs fiches sur quatre, et dans cinq d'entre eux c'est le seul axe qui change (AFGSU, Endométriose, Infertilité et cancers, Croissance et développement du petit enfant, Nutrition infantile). Le public est une sélection multiple : dans le sujet Obésité, une fiche vise « Médecin généraliste + Pédiatre », ses voisines « Médecin généraliste » seul.

**3. Six sujets ont deux fiches identiques sur les trois axes.** Pour elles, seuls le titre ou le numéro d'action DPC les distinguent :

| Sujet | Fiches | Format, modalité, public | Ce qui les sépare |
|---|---|---|---|
| Troubles bipolaires | `92622325195`, `92622525458` | Présentiel, programme intégré, psychiatre | **Rien que le numéro** : même titre |
| AFGSU | `00000000004`, `00000000006` | Présentiel, modalité et public vides | **Rien que le numéro** : même titre |
| Troubles du sommeil | `92622425392`, `92622425402` | Présentiel, programme intégré, généraliste | Le titre |
| Troubles du sommeil | `92622525451`, `92622425413` | Classe virtuelle, programme intégré, généraliste | Le titre (l'une porte sur l'enfant) |
| L'électrocardiogramme | `92622325030`, `92622425371` | Présentiel, programme intégré, généraliste | Le titre |
| Dermatologie courantes | `92622525471`, `92622425379` | E-learning, programme intégré, généraliste | Le titre |
| Symptômes ORL | `92622325319`, `92622325329` | E-learning, formation continue, généraliste | Le titre (adulte, pédiatrique) |

Six sujets, sept paires : Troubles du sommeil en porte deux. Pour les deux paires à titre identique, le numéro d'action DPC est le seul discriminant, et la page doit pouvoir le montrer. Doublon ou nouvelle version d'une même action : la question relève de Noémie, pas de l'application.

**4. Quatre fiches sont « Hybride » avec « (E-learning) » dans leur titre.** Le champ `format` et le titre se contredisent :

| Fiche | Sujet | Public |
|---|---|---|
| `92622325266` | Croissance et développement du petit enfant | Médecin généraliste |
| `92622325150` | Croissance et développement du petit enfant | Pédiatre |
| `92622325119` | Nutrition infantile et diversification alimentaire | Pédiatre |
| `92622325085` | Nutrition infantile et diversification alimentaire | Médecin généraliste |

Ce sont les deux seuls sujets où le format vaut « Hybride », et dans les deux, seul le public distingue les fiches. La maquette doit dire laquelle des deux informations elle affiche ; si elle affiche les deux, le commercial voit une contradiction. Corriger la source relève d'Airtable, pas de l'application, qui ne réécrit ni le titre ni le format.
