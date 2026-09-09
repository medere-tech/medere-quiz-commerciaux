# Application d'entraînement commerciaux — Médéré

Documentation technique de référence. Le point d'entrée est `SYNTHESE.md`. Les instructions chargées automatiquement par Claude Code sont dans `CLAUDE.md`.

---

## 1. Vue d'ensemble

Une dizaine de commerciaux vendent les formations DPC de Médéré à des médecins généralistes, chirurgiens-dentistes et infirmiers. Pour vendre, ils doivent connaître le catalogue et savoir quelle formation enchaîner après quelle autre.

L'application les entraîne par le quiz. Deux modes qui partagent la même banque de questions et la même mémoire :

**Entraînement individuel.** Séries de dix questions tirées aléatoirement, correction immédiate avec explication, étoiles en fin de série, espace de reprise des questions ratées.

**Session collective du jeudi.** Noémie anime, les commerciaux répondent depuis leur appareil, elle révèle la bonne réponse et la répartition. Les réponses données en session alimentent la progression individuelle : une séance ne repart pas de zéro. C'est ce qui distingue l'outil d'un quiz projeté.

### Ce que l'outil doit produire côté métier

L'objectif formulé par Noémie porte sur **les liens entre formations**, pas seulement sur le catalogue pris formation par formation. Cela se construit dans le modèle de données : une question doit pouvoir être rattachée à plusieurs formations, et le type « mise en situation » existe pour tester la capacité à rebondir d'une formation vers une autre. Sans cela, on obtient une banque cloisonnée qui rate la cible.

---

## 2. Architecture

```
Navigateur (Next.js, App Router)
   │
   ├── Firebase Auth (Google, domaine restreint)
   ├── Firestore SDK client ──── règles de sécurité ──── Firestore
   │      (lecture questions, écriture de ses propres réponses,
   │       écouteur temps réel sur la session du jeudi)
   │
   └── Routes serveur Next.js
          ├── /api/airtable/sync   (jeton serveur, lecture seule, cache)
          └── /api/admin/*          (vérification du custom claim côté serveur)

Cloud Function : onCreate sur les réponses → incrémente questionStats
```

Le client parle directement à Firestore pour tout ce qui est couvert par les règles de sécurité. Les routes serveur ne servent qu'à ce qui exige un secret ou une vérification de rôle.

---

## 3. Modèle de données

```
formations/{formationId}          // identifiant du document = airtableId
  airtableId : string              // « rec... », clé de rapprochement Airtable
  numeroActionDpc : string         // identifiant métier, champ primaire Airtable
  nom : string
  cibles : string[]                // sélection multiple, jamais une chaîne
  format : string                  // peut être vide
  modalite : string                // peut être vide
  blocsCertification : string[]    // options réelles : 1 à 4. Stocké tel quel,
                                   // aucune logique applicative ne s'y appuie
  dureeTotale : string             // peut être vide
  urlWebflow : string              // peut être vide
  actif : boolean
  syncLe : timestamp

questions/{questionId}
  type : 'vf' | 'qcm' | 'scenario'
  contexte : string | null        // mises en situation uniquement
  enonce : string
  options : map<string, string>   // { identifiant: libellé }
  ordreOptions : string[]          // les mêmes identifiants, dans l'ordre d'affichage
  bonnesReponses : string[]
  explication : string             // obligatoire, non vide
  formationIds : string[]          // au moins un
  theme : string
  difficulte : 1 | 2 | 3
  statut : 'brouillon' | 'publiee'
  sourceFiche : string?            // facultatif : fiche d'argumentaire d'origine
  sourceVersion : string?          // facultatif : version de cette fiche
  creeeLe, modifieeLe : timestamp
  creeePar : string

users/{uid}
  email, nom, photoURL : string
  role : 'commercial' | 'admin'    // affichage seulement, jamais autorisation
  etoiles, seriesTerminees : number
  creeLe, vuLe : timestamp

users/{uid}/reponses/{reponseId}   // source de vérité, une par tentative
  questionId : string
  correcte : boolean
  optionsChoisies : string[]
  origine : 'entrainement' | 'session'
  repondueLe : timestamp

users/{uid}/etats/{questionId}     // résumé, une par question rencontrée
  reussies, tentatives : number
  derniereRatee : boolean
  majLe : timestamp

questionStats/{questionId}         // agrégat anonyme, écrit par Cloud Function
  tentatives, echecs : number
  majLe : timestamp

questionStats/{questionId}/evenements/{evenementId}
  expireLe : timestamp             // marqueur de dédoublonnage, fermé à tout client

sessions/{sessionId}
  code : string                    // court, lisible à voix haute
  questionIds : string[]
  indexCourant : number
  revelee : boolean
  statut : 'attente' | 'encours' | 'terminee'
  animateurUid : string
  creeeLe : timestamp

sessions/{sessionId}/reponses/{uid_questionId}
  uid, questionId : string
  optionsChoisies : string[]
  correcte : boolean
  repondueLe : timestamp
```

Le modèle `formations` est fixé par `docs/airtable-formations.md`, qui fait foi : il est relevé du schéma réel de la base. L'identifiant du document Firestore est l'identifiant d'enregistrement Airtable, ce qui rend la synchronisation idempotente — relancée deux fois, elle produit le même état.

**Pourquoi un résumé par question en plus des réponses.** Le tirage et la
maîtrise ne s'intéressent qu'à trois chiffres par question : combien de
réussites, la dernière tentative est-elle un échec, la question a-t-elle été
vue. Les recalculer imposait de relire tout l'historique — dix réponses par
jour sur deux ans font cinq mille documents rapatriés à chaque ouverture du
parcours, pour un résultat qui tient en une ligne par question.
`users/{uid}/etats` porte ces trois chiffres, écrits dans le même lot que la
réponse : ou les deux, ou aucun. Le volume est borné par la banque, plus par
l'activité.

Mesuré sur la base réelle, avec 158 réponses sur 14 questions : 270 ms pour
lire les réponses, 119 ms pour lire les états. Sur l'émulateur, à la
volumétrie de deux ans (5 000 réponses, 300 questions) : 712 ms contre 33 ms.

Les réponses restent la source de vérité — c'est d'elles que la Cloud Function
tire `questionStats`, et c'est d'elles que `npm run etats:reprise` reconstruit
les états si l'un d'eux dérive. **Ce que les règles ne vérifient pas :** que
l'état corresponde aux réponses. Il faudrait relire l'historique à chaque
écriture. Elles vérifient la forme, la propriété, et qu'un compteur ne monte
que d'un pas à la fois ; la portée d'un mensonge est bornée à l'affichage du
menteur, puisque `questionStats` est alimentée par les réponses, elles-mêmes
validées verdict compris.

**Pourquoi l'agrégat porte des marqueurs d'événements.** Cloud Functions
garantit une livraison *au moins une fois* : le même événement peut être remis
deux fois, et un compteur incrémenté deux fois pour une seule réponse
discrédite tout l'écran de statistiques. La fonction pose donc, dans la même
transaction que l'incrément, un marqueur portant l'identifiant de l'événement ;
si le marqueur existe déjà, elle ne touche à rien. Ces documents ne servent
qu'à cela : aucune règle ne déclare leur chemin, ils sont donc fermés à tous
les clients, administrateur compris. Ils portent `expireLe` pour qu'une
stratégie TTL les reprenne — la fenêtre de reprise de Cloud Functions v2 étant
de vingt-quatre heures, sept jours de conservation suffisent largement.

**Node 22, déclaré et vérifié.** `engines.node` vaut `22.x` à la racine comme
dans `functions/`. Ce n'est pas une préférence : `firebase-admin` déclare
`>=22`, et sa dépendance `jwks-rsa` `^20.19.0 || ^22.12.0 || >= 23.0.0` — les
versions exactes où Node accepte de charger un module ES par `require()`.
`jwks-rsa` charge `jose`, qui est en modules ES purs et n'expose aucune
condition `require` dans ses `exports`.

Vercel lit `engines.node` pour choisir l'exécutant, et ce champ l'emporte sur
le réglage du projet. Il annonçait `>=20.9.0`, ce qui était faux : `.npmrc`
porte désormais `engine-strict=true` pour qu'un écart de ce genre tombe à
l'installation. **Cette correction répare une déclaration, elle n'a pas réparé
le 500 décrit ci-dessous.**

### Le 500 en production, et ce qu'on en sait

Toutes les pages ont répondu 500 sur `ERR_REQUIRE_ESM`, au fond de la chaîne
`firebase-admin` → `jwks-rsa` → `jose`, alors que le build passait, que la
version déployée était bien Node 22, et que le serveur local fonctionnait.

**Le mécanisme, établi.** Depuis Next 16.2, `next build` crée un lien
symbolique par paquet externalisé :

```
.next/node_modules/firebase-admin-a14c8a5423a75469  →  node_modules/firebase-admin
```

C'est ce nom haché qui apparaît dans l'erreur. Le runtime Turbopack le charge
par `await import(...)`, Node le résout jusqu'au vrai paquet, et le `require()`
qui échoue est celui de `jwks-rsa/src/utils.js` ligne 1, qui charge `jose` —
en modules ES purs depuis la version 6, sans condition `require` dans ses
`exports`. Voir [vercel/next.js#91654](https://github.com/vercel/next.js/issues/91654).

**Ce qui reste inconnu :** pourquoi le processus Vercel n'accepte pas ce
`require`, alors que Node l'autorise depuis 20.19, 22.12 et 23.0.
`process.features.require_module`, journalisé depuis la disposition racine,
doit trancher.

**Reproduire la panne en local**, sur une machine à jour — c'est le seul moyen
de ne pas corriger à l'aveugle :

```bash
npm run build                       # avec output: 'standalone' temporairement
cd .next/standalone
node --no-experimental-require-module   -e "import('firebase-admin-a14c8a5423a75469/auth')"
```

Le drapeau retire la fonctionnalité dont la machine de développement profite
sans le savoir. Sans lui, la commande réussit ; avec lui, elle reproduit
l'erreur de production mot pour mot.

**`functions/` est un paquet à part, et le reste.** Il a ses propres
dépendances, son propre `tsconfig.json`, et se déploie sur Firebase — jamais
sur Vercel, qui n'installe que les dépendances de la racine. Il est donc exclu
de la compilation de l'application : sans cette exclusion, le compilateur de
Next inspectait `functions/src` sans trouver `firebase-functions`, et le
déploiement Vercel échouait sur des imports irrésolus.

**Exclu ne veut pas dire non vérifié.** `npm run typecheck` enchaîne les deux
compilateurs — celui de l'application, puis celui de `functions/` :

```bash
npm run typecheck   # tsc --noEmit && npm --prefix functions run typecheck
```

`npm run build` ne couvre donc plus `functions/`, par construction. **Le
contrôle avant commit est `npm run build && npm run typecheck`**, et le second
échoue clairement si les dépendances de `functions/` ne sont pas installées —
un `npm install --prefix functions` suffit.

**Déployer l'agrégation, et purger ses marqueurs.** Trois gestes, dans cet
ordre :

1. `firebase deploy --only functions` — la fonction se déploie depuis
   `functions/`, en `europe-west1`.
2. `npm run stats:reprise -- --faire` — reconstruit les compteurs à partir des
   réponses déjà en base.
3. **Une stratégie TTL sur les marqueurs**, à créer une fois en console :
   *Firestore → Time-to-live (TTL) → Créer une stratégie*. Groupe de
   collections `evenements`, champ d'horodatage `expireLe`. Le groupe de
   collections, pas un chemin : les marqueurs vivent sous
   `questionStats/{questionId}/evenements`, et une stratégie TTL se déclare
   toujours au niveau du groupe. En ligne de commande, l'équivalent est
   `gcloud firestore fields ttls update expireLe --collection-group=evenements
   --enable-ttl --project=<id>`.

Sans cette stratégie, les marqueurs s'accumulent indéfiniment : environ vingt-
six mille documents par an à raison de dix commerciaux et cinquante réponses
par semaine. Rien ne casse, mais la base enfle pour rien. La suppression est
asynchrone et gratuite en lecture ; seules les suppressions se facturent, au
tarif d'une suppression ordinaire.

**La reprise d'historique.** La fonction n'agrège que les réponses créées
après son déploiement. `npm run stats:reprise` reconstruit les compteurs à
partir des réponses déjà en base — sans quoi l'écran de statistiques
s'ouvrirait vide alors que l'équipe a déjà répondu des centaines de fois. Le
script recalcule chaque agrégat en entier, donc il est rejouable ; c'est aussi
ce qui interdit de le lancer en routine, un incrément arrivé entre sa lecture
et son écriture serait perdu.

**Pourquoi les réponses sont sous le document utilisateur.** C'est ce qui rend l'isolation des scores applicable par les règles de sécurité, et pas seulement par un filtre d'affichage. Noémie ne peut pas voir qui rate quoi, même en ouvrant la console Firebase. Elle voit les statistiques par question via `questionStats`, qui ne contient aucun identifiant.

Cette décision peut être révisée si Noémie ou la direction demandent le nominatif. C'est alors une décision managériale explicite, à assumer comme telle, avec une évolution du modèle. Ne pas l'anticiper dans le code.

**Pourquoi une question peut déclarer sa source.** Les fiches d'argumentaire évoluent. Une formation change de durée, un tarif d'indemnisation bouge, une contre-indication est reformulée — et la question rédigée d'après la version précédente devient fausse. Sans trace de la provenance, cette bascule est silencieuse : rien ne signale qu'une question est périmée, et surtout rien ne permet de retrouver *lesquelles* relire quand une fiche est mise à jour. Renseignés, `sourceFiche` et `sourceVersion` répondent à cette question d'une requête.

**Les deux champs sont facultatifs, et doivent le rester.** Les exiger reviendrait à supposer que toute fiche porte un numéro de version. C'est vrai de la trame d'aujourd'hui, ce n'est pas une propriété du produit : le jour où la trame change, l'application refuserait des questions valides pour une raison qui ne la regarde pas. Absents ou vides, ils passent ; renseignés, ils sont bornés comme les autres champs.

**Principe général : rien dans l'application ne dépend de la structure des fiches d'argumentaire.** Ni leur format, ni leur numérotation, ni la présence d'une version, ni le vocabulaire de leurs rubriques. Les fiches sont un outil de travail de Noémie, elles changeront sans nous prévenir et c'est leur droit. L'application en accepte une trace quand elle existe, elle n'en tire aucune règle. Toute fonctionnalité qui exigerait qu'une fiche soit faite d'une certaine manière est à signaler avant d'être codée.

**Pourquoi les options sont une map et non une liste.** Les règles de sécurité ne savent pas parcourir une liste. Avec `options : [{ id, texte }]`, vérifier que chaque bonne réponse désigne une option existante obligeait à énumérer les positions une à une, donc à plafonner arbitrairement le nombre d'options. La map expose ses clés d'un bloc : `bonnesReponses.toSet().hasOnly(options.keys().toSet())` valide l'ensemble sans limite de taille. L'ordre d'affichage, que la map ne conserve pas, passe dans `ordreOptions`, dont les règles vérifient qu'il décrit exactement les mêmes identifiants.

### Index

`firestore.indexes.json` est versionné et déployé avec `firebase deploy --only firestore:indexes`. Il couvre les requêtes prévues aux lots suivants :

| Collection | Champs | Sert à |
|---|---|---|
| `questions` | `statut` / `type` / `formationIds`, seuls ou combinés, puis `modifieeLe` décroissant | les filtres de la banque, du plus récent au plus ancien (lot 3) |
| `questions` | les mêmes sept combinaisons, puis `modifieeLe` croissant | les mêmes filtres, du plus ancien au plus récent (lot 3) |
| `questions` | les mêmes sept combinaisons, puis `enonce` croissant | les mêmes filtres, par énoncé (lot 3) |
| `formations` | `actif` + `nom` | la liste du back-office, au catalogue ou hors catalogue |

Vingt-et-un index pour la banque : sept combinaisons de filtres, trois tris.

### Ce que ces index coûtent

Le filtrage serveur se paie, et la décision doit porter son prix pour qu'on
puisse la réévaluer.

**À l'écriture.** Chaque question écrite met à jour les 21 index composites de
`questions`, plus ses index à champ unique. Firestore facture ces mises à jour
dans l'écriture du document : une écriture reste une écriture, quel que soit
le nombre d'index — ce n'est pas le compteur d'opérations qui enfle, c'est la
latence de l'écriture et le stockage. À notre rythme — des imports en lot
quelques fois par mois, quelques corrections par semaine — c'est invisible.

**Au stockage.** Une entrée d'index pèse la taille des valeurs indexées plus
celle du chemin du document. Pour 300 questions × 22 index, avec des valeurs
courtes (`statut`, `type`, un identifiant Airtable, une date) et un énoncé
borné à 180 caractères par les règles, l'ordre de grandeur est de quelques
mégaoctets — à comparer au gigaoctet du quota gratuit. Là encore, invisible.

**Quand le réévaluer.** Deux signaux : une banque qui dépasse quelques
milliers de questions, ou un filtre supplémentaire dans la banque — chaque
nouveau filtre double le nombre de combinaisons, donc le nombre d'index. À ce
moment-là, la question à poser n'est pas « faut-il moins d'index » mais
« faut-il encore proposer ces filtres croisés ».

Ce coût est le contrepoids d'un gain mesuré : sans filtrage serveur, chaque
ouverture de la banque téléchargeait la collection entière.

**Un index composite ne se parcourt pas dans les deux sens.** Firestore
inverse l'ordre complet, pas un champ isolé : `(statut ASC, modifieeLe DESC)`
ne sert pas un tri `(statut ASC, modifieeLe ASC)`. Chaque direction de tri
demande son propre index. Seule la direction d'un champ filtré par égalité est
libre, puisqu'elle ne contraint pas le résultat.

**Le fichier décrit exactement ce que le code émet, dans les deux sens.** Un
index déclaré que personne n'interroge se paie à chaque écriture sans jamais
servir une lecture ; une requête non déclarée tombe en production. Les index
prévus pour les lots à venir n'y figurent donc pas : ils s'ajouteront avec la
requête qui les justifie.

Les dérogations (`fieldOverrides`) désactivent l'indexation automatique de `options`, `ordreOptions`, `bonnesReponses`, `optionsChoisies`, `explication` et `contexte`. **`enonce` n'en fait plus partie** : la banque le trie côté serveur, l'index à champ unique est donc nécessaire. Les règles bornent sa longueur, l'entrée d'index reste courte. Aucune requête ne les filtre — la recherche sur l'énoncé se fait dans le navigateur, sur une banque de quelques centaines de questions. Pour `options`, la raison est plus forte : chaque clé de map crée sinon son propre chemin indexé, et une banque de questions aux identifiants d'options variés ferait enfler l'index sans qu'aucune lecture n'en profite.

Les index à champ unique restent automatiques : `questions.statut`, `questions.modifieeLe`, `questions.enonce`, `formations.nom` et les autres tris simples n'ont rien à déclarer ici.

### Ce qui reste au navigateur, et pourquoi

**La recherche plein texte.** Firestore ne sait pas chercher dans un texte :
ni sous-chaîne, ni insensibilité aux accents, ni recherche simultanée sur
l'énoncé, le thème et le nom de la formation. C'est une limite du produit, pas
un choix d'implémentation. La recherche s'applique donc à l'ensemble que les
filtres serveur ont déjà réduit : taper un terme rapatrie cet ensemble, page
par page, sous un plafond de mille questions — au-delà, l'écran le dit et
invite à resserrer un filtre. Une vraie recherche exigerait un service
d'indexation externe, décision à prendre pour elle-même.

**Le tirage des séries.** La pondération du README attribue un poids à
*chaque* question publiée avant d'en tirer dix sans remise. Il faut donc la
liste complète des questions publiées : aucun filtre serveur ne la réduit sans
changer l'algorithme.

**Le tirage des séries lit toutes les questions publiées.** La pondération
attribue un poids à *chaque* question publiée avant d'en tirer dix sans
remise : il faut la liste entière. Le SDK navigateur ne sait pas projeter sur
les seuls identifiants — `select()` n'existe que côté Admin — si bien que lire
trois cents identifiants coûte trois cents documents. Aucun filtre serveur ne
réduit cela sans changer l'algorithme.

L'ordre de grandeur, à maturité : 300 questions par lancement de série. Dix
commerciaux, trois séries par jour, vingt jours par mois font 600 séries, donc
180 000 lectures par mois — environ 12 % du quota gratuit (50 000 lectures par
jour). Un cache mémoire de cinq minutes évite la double lecture entre l'accueil
et l'écran de série, ce qui ramène le compte à une lecture de banque par série.
Le seuil à surveiller est la taille de la banque : à mille questions, la même
arithmétique donne 40 % du quota, et il faudra alors trancher entre
dénormaliser la liste des identifiants publiés et revoir le tirage.

**La détection des doublons à l'import** interroge la banque par lots de
trente énoncés (`where('enonce', 'in', …)`, la limite de Firestore), au lieu
de la télécharger en entier. Une réserve : Firestore compare des chaînes
exactes, alors que la comparaison du navigateur était normalisée. Deux énoncés
qui ne diffèrent que par la casse ou les accents ne sont donc plus signalés
comme doublons de la banque. Le rétablir demanderait un champ
`enonceNormalise` sur chaque question et son index. La détection à l'intérieur
du tableau collé, elle, reste normalisée.

**Vérification obligatoire avant tout déploiement.** L'émulateur n'exige aucun index : une requête qui en manque y passe sans broncher, et n'échoue qu'en production, sur un `FAILED_PRECONDITION`, à la première requête d'un commercial. La parade est un test d'intégration contre une vraie base :

```bash
npm run index:verifier -- --projet=<id> --deployer
```

Le script déploie les index, exécute chaque requête que l'application émettra, patiente pendant leur construction — elle est asynchrone et peut durer plusieurs minutes — puis sort en erreur en listant les requêtes sans index, avec l'adresse de création fournie par Firestore. Il refuse de démarrer si `FIRESTORE_EMULATOR_HOST` est défini : une vérification passée à l'émulateur ne prouverait rien.

La liste des requêtes vit dans `scripts/verifier-index.ts`. **Elle doit rester le miroir exact de celles du code** : toute requête ajoutée à l'application s'y déclare dans le même geste, sinon le script certifie une couverture qu'il n'a pas vérifiée.

Une réserve sur le calendrier : sur une collection encore vide, rien ne garantit que Firestore aille jusqu'à réclamer l'index plutôt que de renvoyer un résultat vide. La vérification n'a donc de valeur qu'exécutée contre une base qui contient des questions et des réponses — à partir du lot 5, quand les requêtes du tirage et du back-office existeront pour de bon.

### Sauvegardes et restauration

Deux mécanismes complémentaires, activés en console. Ils ne se remplacent pas : l'un couvre l'accident qu'on voit tout de suite, l'autre celui qu'on découvre trois semaines plus tard.

**Récupération à un instant donné (PITR).** Une fois activée, Firestore conserve sept jours de versions. On relit la base à n'importe quelle microseconde de la dernière heure, et à la minute près au-delà, dans la limite de ces sept jours. C'est la parade à l'accident de manipulation : un import qui écrase deux cents questions, une suppression en masse un jeudi soir. Au-delà de sept jours, elle ne couvre plus rien.

**Sauvegardes planifiées quotidiennes.** Un instantané par jour, avec une durée de conservation réglable jusqu'à quatorze semaines. C'est la parade à ce qui se découvre tard : une question modifiée par erreur le mois dernier, une corruption progressive, un projet supprimé. La granularité est le jour, pas la minute — d'où l'intérêt de garder les deux.

**Une restauration crée une nouvelle base.** Ni PITR ni sauvegarde planifiée n'écrase la base existante : les deux écrivent dans une base neuve, avec un identifiant neuf. Trois conséquences, à connaître avant d'en avoir besoin :

- **Le quota gratuit Firestore ne couvre qu'une seule base par projet.** La base restaurée sort de ce quota et se facture dès sa création. Le temps d'un dépannage, ce n'est rien ; oubliée allumée, c'est une ligne sur la facture tous les mois.
- **Restaurer ne rétablit pas le service.** Il faut ensuite faire pointer l'application sur la nouvelle base, ou y recopier ce qui manque avant de la supprimer. Ce choix se prépare à froid, pas pendant l'incident.
- **Les deux mécanismes se facturent** : le stockage des sauvegardes, et la restauration selon la taille de la sauvegarde. Ils exigent le plan Blaze — le nôtre — dont l'alerte budgétaire doit couvrir ce surcoût.

À activer une fois, en console : PITR sur la base, une planification quotidienne avec quatorze semaines de conservation, et une relecture de l'alerte budgétaire.

---

## 4. Règles de sécurité

À écrire explicitement et à tester avec l'émulateur. Jamais de mode test, même temporairement.

- `formations`, `questions` — lecture par tout utilisateur authentifié du domaine ; écriture réservée au custom claim administrateur.
- `users/{uid}` et `users/{uid}/reponses` — lecture et écriture par le propriétaire uniquement. **Aucune exception administrateur.**
- `questionStats` — lecture par l'administrateur ; écriture réservée aux Cloud Functions.
- `sessions` — lecture par tout utilisateur authentifié ; écriture réservée à l'animateur. Chaque participant n'écrit que sa propre réponse.
- Restriction de domaine vérifiée côté serveur, pas seulement dans l'interface.

Le custom claim est posé par une fonction d'administration à partir d'une liste d'adresses en variable d'environnement. Rappel du piège : la valeur n'apparaît dans les règles qu'au rafraîchissement du jeton.

### Contrôle de forme

Les règles ne se contentent pas de dire qui écrit, elles disent quoi. C'est la seule validation qui tienne face à un client modifié ou à un import mal formé : celle du navigateur se contourne, celle du serveur ne couvre que les chemins qui passent par lui.

- **Jeu de champs exact.** Chaque document est comparé à la liste des champs de son modèle : ni champ libre ajouté, ni champ manquant.
- **Questions.** Explication et énoncé non vides, type parmi `vf`/`qcm`/`scenario`, `formationIds` non vide et sans doublon, difficulté dans 1-3, statut parmi `brouillon`/`publiee`. Le contexte est obligatoire pour une mise en situation et interdit ailleurs. `bonnesReponses` désigne des options existantes, `ordreOptions` décrit exactement les clés de la map. L'auteur ne peut être que celui qui écrit, et `creeePar` comme `creeeLe` ne sont plus modifiables ensuite. `sourceFiche` et `sourceVersion` sont facultatifs : absents ou vides, ils passent ; renseignés, ils doivent être des chaînes bornées.
- **Réponses, individuelles et en session.** Le verdict n'est pas déclaratif : les règles relisent la question par `get()` et recalculent `correcte` en comparant les ensembles. Une réponse partielle à un QCM multiple est fausse, et une réponse exacte déclarée fausse est refusée aussi — elle fausserait `questionStats` autant que l'inverse. La question doit exister et être publiée, et aucune option choisie ne peut sortir de la map des options.
- **Progression.** `etoiles` ne peut que monter, de 0 à 3 par écriture ; `seriesTerminees` de 0 à 1. Le client ne touche à rien d'autre sur son document.
- **Sessions.** Code, liste de questions sans doublon, index courant compris dans cette liste, statut parmi `attente`/`encours`/`terminee`.
- **Horodatages.** Aucun document ne peut être daté dans le futur.
- **Formations.** Mêmes contrôles, mais ils ne couvrent que l'écriture manuelle : la synchronisation Airtable passe par le SDK Admin, hors règles, et doit donc les rejouer dans son propre code (voir section 6).

**Ce que les règles ne savent pas vérifier.** Elles ne parcourent ni les valeurs d'une map, ni les éléments d'une liste. Conséquence directe : **rien ne garantit côté règles que chaque libellé d'option est une chaîne non vide et de longueur raisonnable.** Une question dont une option porte un libellé vide, un nombre, ou un texte de dix mille caractères passera les règles. Ce contrôle appartient à la validation serveur de l'import (lot 4) et à l'éditeur (lot 3), qui doivent refuser la ligne et la signaler. La même limite vaut pour la longueur individuelle des identifiants à l'intérieur des listes : les règles n'en bornent que le cumul.

### Plafonds de longueur

Sans plafond, une seule écriture peut approcher le document maximal d'un mégaoctet, faire enfler les index et alourdir chaque lecture. Les valeurs sont dimensionnées sur l'usage réel, pas sur la limite technique.

| Champ | Plafond | Pourquoi |
|---|---:|---|
| `questions.enonce` | 500 | une question doit rester lisible sans défilement sur 375 px |
| `questions.explication` | 1000 | quelques phrases de correction, pas un cours |
| `questions.contexte` | 1000 | une mise en situation tient en un paragraphe |
| `questions.theme` | 60 | c'est un libellé de filtre |
| `questions.sourceFiche` (facultatif) | 200 | un titre de fiche d'argumentaire |
| `questions.sourceVersion` (facultatif) | 40 | un numéro de version ou une date |
| `questions.creeePar`, `sessions.animateurUid`, `reponses.uid`, `reponses.questionId` | 128 | longueur maximale d'un identifiant Firebase Authentication ; un identifiant Firestore généré en fait 20 |
| `formations.airtableId` | 64 | un identifiant d'enregistrement Airtable en fait 17 |
| `formations.numeroActionDpc` | 60 | un numéro d'action DPC en fait onze |
| `formations.nom` | 200 | un intitulé de formation DPC |
| `formations.format`, `formations.modalite`, `formations.dureeTotale` | 60 | libellés courts, issus de sélections Airtable |
| `formations.urlWebflow` | 500 | une URL de fiche publique |
| `formations.cibles` (cumul) | 500 | sept publics possibles au référentiel |
| `formations.blocsCertification` (cumul) | 200 | quatre options au référentiel — `1` à `4` |
| `sessions.code` | 12 | il est lu à voix haute puis saisi à la main |
| `questions.formationIds` (cumul) | 1000 | une question se rattache à quelques formations, pas à cinquante |
| `questions.bonnesReponses` (cumul) | 1000 | sous-ensemble des options, borné par elles |
| `questions.options` (cumul des clés) | 2000 | laisse la place à une centaine d'options |
| `questions.ordreOptions` (cumul) | 2000 | même ensemble que les clés d'options |
| `reponses.optionsChoisies` (cumul) | 1000 | borné par les options de la question |
| `sessions.questionIds` (cumul) | 4000 | environ deux cents questions dans une même session |

Les plafonds « cumul » portent sur la concaténation de la liste, faute de pouvoir mesurer chaque élément. C'est le volume total qui pèse sur le document et sur les index, donc c'est lui qu'on borne.

Le document `users/{uid}` n'a aucun plafond : les seuls champs que le client peut y modifier sont deux entiers et un horodatage. Ses chaînes sont écrites par le serveur, hors règles.

### App Check

App Check atteste que la requête vient de notre application, et non d'un script qui rejouerait la clé d'API Firebase depuis ailleurs. Il ne remplace ni l'authentification ni les règles : il filtre en amont, sur l'origine de l'appel.

L'intégration côté client est en place (`src/lib/firebase/app-check.ts`, démarrée avec l'application Firebase). La clé de site est une variable exigée au démarrage : **il n'existe pas de mode dégradé** où l'application tournerait sans attestation.

L'application stricte, elle, est un réglage de console, et elle n'est pas encore activée : les jetons sont émis et comptés, rien n'est refusé. C'est l'ordre à respecter, sous peine de couper l'accès à tout le monde d'un coup.

Mise en service, dans cet ordre :

1. Console Google Cloud, reCAPTCHA Enterprise : créer une **clé de site de type site web**, pour le domaine de production et pour `localhost`. Elle est publique, elle apparaît dans le code de la page.
2. Renseigner `NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY` dans `.env.local` et dans les variables d'environnement Vercel.
3. Console Firebase, App Check : enregistrer l'application web avec cette clé reCAPTCHA Enterprise.
4. **Développement local et tests.** Le domaine local n'est pas attesté par reCAPTCHA. Lancer l'application en développement : le SDK affiche dans la console du navigateur un jeton de débogage, à enregistrer dans Firebase, App Check, onglet des jetons de débogage. Pour figer ce jeton entre plusieurs machines ou dans une intégration continue, le placer dans `NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN`. Le mécanisme est inactif en production. Les tests d'émulateur ne sont pas concernés : l'émulateur Firestore ne vérifie pas App Check.
5. Laisser tourner quelques jours et **vérifier dans les métriques App Check que les requêtes légitimes remontent comme vérifiées**, y compris depuis les téléphones des commerciaux.
6. Seulement alors : activer l'application stricte pour Firestore, dans la console Firebase.

Une clé absente ou vide fait échouer le démarrage comme n'importe quelle autre variable manquante, avec le même message nominatif. Le seul réglage facultatif est `NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN`, qui ne concerne que le développement local.

---

## 5. Algorithmes

### Tirage des séries

Dix questions, uniquement parmi les publiées, tirage pondéré sans remise :

| Situation | Poids |
|---|---|
| Jamais vue | 3 |
| Dernière tentative ratée | 6 |
| Réussie une fois | 1,2 |
| Réussie deux fois ou plus | 0,4 |

Si moins de dix questions publiées sont disponibles, la série est plus courte plutôt que de répéter une question.

Le mode « revoir mes questions ratées » ne tire que parmi les questions dont la dernière tentative est un échec, dans un ordre aléatoire.

### Étoiles

Attribuées en fin de série complète : trois à partir de 90 % de réussite, deux à partir de 70 %, une à partir de 50 %, aucune en dessous. Total cumulé sur le document utilisateur. Une série abandonnée ne rapporte rien, mais les réponses déjà données sont conservées.

### Validation

Pour les QCM à réponses multiples, l'ensemble sélectionné doit correspondre exactement à l'ensemble attendu. Une réponse partielle est fausse, et l'interface montre ce qui avait été trouvé et ce qui manquait. L'explication s'affiche systématiquement, y compris en cas de bonne réponse.

---

## 6. Intégration Airtable

**Périmètre : le référentiel des formations, rien d'autre. Lecture seule.**

Le jeton doit être créé avec les seuls scopes `data.records:read` et `schema.bases:read`, restreint à la base formations. Ainsi configuré, il n'a pas la capacité d'écrire — la protection est structurelle, pas comportementale.

Deux points à connaître : les jetons Airtable n'expirent pas, et le nom du jeton apparaît dans l'historique de révision des enregistrements. Le nommer explicitement, par exemple « quiz-commerciaux — lecture seule ».

`docs/airtable-formations.md` fait foi sur le modèle et sur les identifiants. Il est relevé du schéma de la base, pas déduit.

### Lecture par identifiants

Tous les appels passent `returnFieldsByFieldId=true` et lisent les champs par leur identifiant `fld...`. Un nom de champ se renomme d'un clic dans Airtable ; l'identifiant est immuable. Les identifiants sont rassemblés dans `src/lib/airtable/contrat.ts`, et un test vérifie qu'un enregistrement indexé par noms de champs ne produit rien d'exploitable — la lecture par nom ne peut pas réapparaître par mégarde.

### Lecture seule, vérifiée

Le module d'accès n'expose aucune fonction d'écriture, et la méthode HTTP `GET` y est écrite en dur plutôt que passée en paramètre. Trois tests lisent le code source de `src/lib/airtable/` et échouent si un verbe d'écriture, une méthode autre que `GET` ou une fonction au nom évocateur y apparaissent. Ce n'est pas une preuve — on contourne toujours un test de ce genre — mais l'infraction devient visible en revue au lieu d'être silencieuse.

### Validation de forme dans le code

La synchronisation écrit avec le SDK Admin, qui n'est pas soumis aux règles de sécurité. Les contraintes de forme des `formations` sont donc réécrites dans `src/lib/airtable/conversion.ts`, avec les mêmes plafonds que les règles — les valeurs sont rassemblées dans une constante `PLAFONDS` qui doit être tenue à l'identique des deux côtés.

Une formation invalide est **rejetée, comptée et détaillée** dans le compte rendu, jamais écrite en silence, et jamais au prix des autres : un enregistrement en défaut n'empêche pas les suivants d'être synchronisés. Un test croisé écrit dans l'émulateur une formation acceptée par la conversion et vérifie que les règles l'acceptent aussi : les deux validations disent la même chose, et le jour où elles divergeront, il échouera.

### Statut et désactivation

La sélection « Statut de la formation » n'offre que deux valeurs, relevées au schéma : « Active » et « Suspendue ». **Une formation est active si, et seulement si, son statut vaut « Active ».** Tout le reste — « Suspendue », case vide, valeur inconnue — donne `actif: false`.

C'est une liste blanche, et c'est délibéré : proposer aux commerciaux une formation dont personne n'a dit qu'elle était proposable coûte plus cher qu'en masquer une par excès de prudence. Une formation masquée se remarque et se corrige ; une formation vendue à tort, non.

Les cas anormaux sont comptés séparément dans le compte rendu, parce qu'ils appellent des gestes différents. `statutsInconnus` liste les valeurs qu'on ne sait pas lire — une option ajoutée dans Airtable après notre relevé, à arbitrer ici. `statutsAbsents` liste les identifiants des formations dont la case est vide — un oubli de saisie, à corriger là-bas. Aucun des deux ne change le comportement, qui est le même dans tous les cas : la formation est inactive. Ils existent pour que la cause se voie, puisque désormais une case oubliée suffit à retirer une formation du catalogue. C'est du diagnostic, pas de l'affichage.

### Normalisation de l'adresse Webflow

Une adresse saisie sans protocole — `www.medere.fr/formation/...` — n'est pas un lien : le navigateur la traite comme un chemin relatif. La synchronisation préfixe `https://` quand le protocole manque ; une adresse vide reste vide, une adresse qui porte déjà un protocole n'est pas touchée.

La correction est faite une fois, sur ce qu'on stocke, plutôt que répétée dans chaque écran qui affiche un lien — où l'un d'eux finirait par l'oublier. **Airtable n'est pas modifié** : on normalise ce que l'on stocke, pas la source.

Le plafond de 500 caractères porte sur l'adresse telle qu'elle sera écrite, protocole compris : c'est cette valeur-là que les règles vérifieront.

En revanche, `dureeTotale` est stockée brute — `"7"`, `"11"`. L'unité est une décision d'affichage, elle n'a rien à faire dans les données.

Création des nouvelles, mise à jour des existantes par `airtableId`, passage à `actif: false` pour celles qui ont disparu de la réponse. **Jamais de suppression**, pour ne pas casser les questions rattachées. L'écriture est complète et non fusionnée : le document reflète exactement Airtable, sans champ résiduel d'une version précédente du modèle.

### Déclenchement

| Appelant | Méthode | Authentification |
|---|---|---|
| Tâche planifiée Vercel, une fois par jour à 4 h UTC | `GET /api/airtable/sync` | `Authorization: Bearer <CRON_SECRET>` |
| Bouton du back-office, à la demande | `POST /api/airtable/sync` | session administrateur, custom claim vérifié côté serveur |

La planification est déclarée dans `vercel.json`. Vercel pose lui-même l'en-tête d'autorisation dès que `CRON_SECRET` existe côté projet ; sans en-tête valide, la route répond 401. Cette route écrit dans Firestore : elle n'est jamais accessible anonymement.

**Pourquoi une seule fois par jour.** Le plan Vercel de l'équipe est Hobby, qui limite les tâches planifiées à une exécution quotidienne : une expression plus fréquente est refusée au déploiement, pas à l'exécution. Le `0 */6 * * *` d'origine faisait donc échouer le déploiement entier.

**Pourquoi 4 h UTC.** Hobby n'assure pas l'heure exacte : la précision est horaire, une tâche déclarée à 4 h part quelque part entre 4 h 00 et 4 h 59. Paris étant à UTC+1 l'hiver et UTC+2 l'été, le pire cas est l'été : le départ se situe entre 6 h et 7 h heure de Paris, et la synchronisation est passée bien avant l'arrivée de l'équipe. L'hiver, elle tombe entre 5 h et 6 h. Reculer à 6 h UTC ferait démarrer certaines exécutions à 8 h 59 heure de Paris l'été, soit pendant que Noémie ouvre le back-office — c'est la marge que ce choix protège.

**Ce qu'un passage en Pro rendrait possible.** Le plan Pro autorise une exécution par minute et une précision à la minute. Revenir à `0 */6 * * *` y serait immédiat, et n'aurait de sens que si le référentiel se mettait à bouger plusieurs fois par jour — ce qui n'est pas le cas aujourd'hui. La décision se prendra sur ce constat, pas par principe.

**Le déclenchement manuel n'est pas concerné.** Le bouton de l'écran Formations appelle la route en `POST` avec la session administrateur : il ne passe pas par la planification, et reste disponible autant de fois qu'il le faut. C'est le recours quand une formation vient d'être corrigée dans Airtable et qu'on ne veut pas attendre le lendemain.

Le déclenchement manuel est refusé si une synchronisation a eu lieu il y a moins de cinq minutes, sauf demande explicite. Le référentiel ne change pas si vite, et un bouton se martèle. Aucune page n'appelle l'API Airtable : les écrans lisent `formations` dans Firestore, la synchronisation est le seul chemin vers Airtable.

### Compte rendu

Chaque exécution écrit `synchronisations/formations` : date, durée, nombre lu, créées, mises à jour, désactivées, rejetées avec leurs raisons, statuts inconnus rencontrés et identifiants des formations sans statut. Le document est lisible par l'administrateur, écrit par personne d'autre que le serveur. C'est ce que le back-office affichera comme « dernière synchronisation », et c'est là qu'on regarde quand une formation manque au catalogue.

---

## 7. Écrans

### Le système de design dans le code

Le design vient du projet Claude Design `6ed08356-56e4-4a06-ab31-037cb1ea59a1` ; `docs/design-imports.md` donne la correspondance page → lot et le tri écran par écran. **Un écran de maquette n'est pas une décision de produit** : on implémente ce qui est tranché dans le code, le reste attend.

Les jetons sont copiés à l'identique dans `src/styles/systeme.css` — couleurs, typographie, échelles, rayons, élévation, mouvement. On ne les ajuste pas ici : une valeur qui ne convient pas se corrige dans Claude Design puis se réimporte, sans quoi la maquette et le code divergent sans qu'on s'en aperçoive.

Les primitives sont dans `src/composants/ds/` : bouton, carte, champ, zone de texte, sélecteur, onglets, étiquettes, jeu d'icônes, états vides / chargement / erreur. Rembourrages, rayons et états sont ceux du bundle du système, pas des approximations. Les sept formes de la marque sont dans `public/formes/`, déjà teintées : le repère d'une formation est sa forme, jamais une puce colorée.

**Deux polices à déposer.** Aileron et DM Serif Text sont fournies avec le système sous forme de fichiers. Copiez-les dans `public/polices/` sous les noms attendus par `src/styles/systeme.css` : `Aileron-Light.ttf`, `Aileron-Regular.ttf`, `Aileron-SemiBold.ttf`, `Aileron-Bold.ttf`, `DMSerifText-Regular.ttf`, `DMSerifText-Italic.ttf`. Tant qu'elles manquent, les piles de repli s'appliquent — la mise en page reste juste, la personnalité typographique manque. Elles ne sont pas dans le dépôt : ce sont des binaires, ils viennent du système, pas du code.

### Côté commercial

`/` accueil — maîtrise globale, étoiles, avancement par formation, deux actions.
`/entrainement` — série en cours, une question à la fois, correction.
`/revoir` — questions à retravailler.
`/session/[code]` — vue participant de la session du jeudi.

### Côté Noémie

`/admin/questions` — banque filtrable par formation, type et statut, avec recherche sur l'énoncé.
`/admin/questions/[id]` — éditeur adapté aux trois types. Le champ contexte n'apparaît que pour les mises en situation. L'explication est obligatoire : la validation refuse un enregistrement sans elle.
`/admin/import` — **la fonction la plus importante du back-office.** Les questions sont produites en lot avec une IA, elles ne seront jamais saisies une par une. Collage de tableur ou CSV, prévisualisation ligne par ligne avec erreurs localisées, correction dans la prévisualisation, import. Tout arrive en brouillon. Un import partiellement invalide importe les lignes correctes et détaille les autres, il n'échoue pas en bloc.
`/admin/statistiques` — questions classées par taux d'échec, depuis `questionStats` uniquement. Aucun nom d'utilisateur sur cet écran.
`/admin/session` — vue animateur.

Les routes `/admin` sont protégées côté serveur par le custom claim, pas par une redirection côté client.

### Session du jeudi

Vue animateur : question en cours, nombre de réponses reçues qui monte en direct sans révéler la répartition, bouton pour révéler la bonne réponse et la distribution, passage à la question suivante.

Vue participant : question et options, puis attente après validation jusqu'à la révélation.

**Contrainte hybride.** Une partie des participants est en visioconférence et voit l'écran partagé avec plusieurs secondes de retard. La question est poussée sur l'appareil de chacun par un écouteur Firestore temps réel. Ne jamais dépendre de la projection.

---

## 8. Lots de développement

Un lot, une branche, une PR, une validation. On ne passe pas au suivant sans que le précédent tourne.

1. **Fondations** — projet, authentification Google avec restriction de domaine, règles de sécurité testées à l'émulateur, structure des collections.
2. **Airtable** — synchronisation vers `formations`, en lecture seule.
3. **Back-office : banque et éditeur.** Vient avant le parcours commercial, sinon rien ne peut être saisi et tout se teste sur des données en dur.
4. **Import en masse.**
5. **Parcours commercial** — accueil, série, correction, fin de série, questions à revoir.
6. **Cloud Function d'agrégation et statistiques.**
7. **Session collective temps réel.**
8. **Finition** — états vides, erreurs, chargements, navigation clavier, mobile.

### Candidat pour le lot 8 : une vérification en intégration continue

Un workflow GitHub Actions qui rejoue `build`, `typecheck`, `lint` et les tests
sur chaque poussée, dans un environnement propre — dépendances installées
depuis les fichiers de verrouillage, racine et `functions/`, sans rien qui
traîne d'une manipulation antérieure.

**Ce que ça aurait attrapé.** Les deux pannes de déploiement de ce projet ont
la même forme : un artefact vérifié d'un côté, utilisé de l'autre. Les règles
Firestore publiées qui divergeaient du dépôt au lot 3, et `functions/` qui ne
compilait en local que grâce à un `npm install` fait à la main dans ce dossier,
au lot 6. Un environnement neuf à chaque poussée rend ces deux écarts visibles
avant le déploiement, pas après.

À cadrer au moment du lot : quels secrets exposer au workflow — l'émulateur
Firestore n'en demande aucun, la vérification des index en demande —, et si la
vérification des règles publiées y entre ou reste un geste de déploiement.

---

## 9. Qualité attendue

Navigation au clavier complète sur le parcours d'entraînement, avec focus visible : un commercial pressé doit pouvoir répondre sans souris. `prefers-reduced-motion` respecté. Lisible jusqu'à 375 pixels de large. Contraste suffisant y compris sur les textes secondaires.

Règles de sécurité testées à l'émulateur avant chaque déploiement. `npm run build` vert avant tout commit.

---

## 10. Risques du projet

Ils ne sont pas techniques.

**Le volume de questions.** C'est 80 % de la valeur et 80 % de la charge, et cela repose sur Noémie. En dessous d'environ 150 questions publiées au lancement, les commerciaux bouclent la banque en deux sessions et décrochent. À cadrer avant le développement, pas après.

**L'adoption.** Personne ne s'entraîne spontanément. Il faut un rituel et un sponsor côté commercial — Jordan. Sans lui, l'outil reste optionnel.

**Le classement.** Un score visible par la direction transforme un outil d'apprentissage en outil d'évaluation, et les gens cessent de se tromper, donc d'apprendre. D'où le choix du privé en V1.

---

## 11. Sources

- Claude Code, mémoire et CLAUDE.md — https://code.claude.com/docs/en/memory
- Airtable, jetons d'accès personnels — https://airtable.com/developers/web/guides/personal-access-tokens
- Firestore, tarification et quotas — https://firebase.google.com/docs/firestore/pricing
- Firebase, règles de sécurité et authentification — https://firebase.google.com/docs/rules/rules-and-auth
- Firebase, custom claims — https://firebase.google.com/docs/auth/admin/custom-claims
