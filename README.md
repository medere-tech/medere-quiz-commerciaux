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

### Navigation interne : pourquoi un clic doit être instantané

Les douze routes sont dynamiques : chacune lit le cookie de session, donc chacune est rendue à la demande. Sans précaution, cela veut dire qu'**un clic paie un aller-retour serveur complet** — mesuré à 500 ms de médiane sur la production, pour 1,4 ko de charge utile. Ce n'est pas du transfert, c'est de la latence pure, et elle est là à chaque changement d'écran.

Trois mécanismes s'ajoutent pour l'effacer. Ils ne se remplacent pas.

**1. Une frontière `loading.tsx` par section** — `(parcours)`, `serie`, `admin`. C'est elle qui donne au clic une réponse immédiate : la coquille et les squelettes s'affichent pendant que le contenu arrive en flux. Mesuré sur une route dynamique équivalente, aller-retour serveur de 400 ms :

| | sans `loading.tsx` | avec |
|---|---|---|
| Première chose affichée après le clic | rien pendant **425 ms** | squelette à **23 ms** |
| Contenu complet | 425 ms | 439 ms |

**2. `<Link>` plutôt que `router.push`.** Un bouton qui ne fait que naviguer est un lien déguisé : `router.push` ne précharge rien, `<Link>` précharge dès que l'élément entre dans le champ. La primitive `Bouton` accepte donc un `href` et rend un `<a>` — même dessin, mêmes états. Là où la navigation ne peut pas être un lien (une ligne de tableau qu'on ouvre, une redirection après enregistrement), `useIntentionDeNavigation` précharge au survol, au premier contact tactile ou à l'arrivée au clavier ; `usePrechargementCertain` précharge dès l'affichage les sorties qu'on sait d'avance — de la série on revient à l'accueil, de l'éditeur à la banque.

**3. `experimental.staleTimes.dynamic`.** Depuis Next 15, la valeur par défaut est zéro : revenir sur un écran déjà vu le recalculait intégralement. À trente secondes, mesuré sur la même route :

| Retour sur un écran déjà vu | avant | après |
|---|---|---|
| Requêtes réseau | 1 aller-retour | **aucune** |
| Contenu affiché | ~430 ms | **12 ms** |

Ce cache ne porte que la coquille et la structure. Les données de progression sont relues côté navigateur à chaque affichage : on ne montre jamais un avancement périmé.

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

**Les essais de l'équipe pédagogique ne s'agrègent pas.** Noémie doit pouvoir
parcourir le quiz comme un commercial — c'est elle qui écrit les explications
affichées après chaque réponse, et sans les voir en situation elle travaille à
l'aveugle. Mais elle relit alors des questions qu'elle vient d'écrire, donc
elle y répond juste, donc elle ferait baisser le taux d'échec précisément des
questions qu'elle inspecte. Le biais est orienté, pas aléatoire, et il touche
l'écran qui sert à décider quoi réécrire. La Cloud Function écarte donc les
comptes portant le custom claim `admin` : l'identifiant sert à décider, jamais
à écrire, et `questionStats` continue de ne porter aucun `uid`. Ses réponses
restent enregistrées sous son compte — sa progression, ses questions à revoir —,
c'est ce qui rend l'aperçu fidèle.

**`questionStats` contient aujourd'hui des données de recette.** Quatorze
questions, 173 réponses, toutes venues du seul compte qui ait jamais ouvert
l'application, et qui est administrateur. Elles sont conservées volontairement :
ce sont les seules qui permettent de voir l'écran de statistiques rempli avant
la mise en service. **Elles partiront au nettoyage général, avec le reste des
données de test**, et `questionStats` avec elles. Le recomptage historique
(`npm run stats:reprise`) sait les écarter — il vide donc la collection tant
que personne d'autre n'a répondu : ne pas le lancer avant le nettoyage.

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

### Le 500 en production : cause et correction

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

**La cause, mesurée en production.** Une sonde placée dans `register` de
`instrumentation.ts` — le seul point atteint avant tout chargement de module —
a donné :

```
[SONDE] node=v22.23.2 require_module=false cwd=/var/task
[SONDE] import haché  : ECHEC ERR_REQUIRE_ESM
[SONDE] import direct : ECHEC ERR_REQUIRE_ESM
```

`process.features.require_module` vaut **`false`** sur Node 22.23.2, alors que
la fonctionnalité est stabilisée depuis 22.12 : l'exécutant Vercel la désactive
au lancement. Les deux imports échouent, donc ni Turbopack ni le lien
symbolique ne sont en cause — c'est l'environnement d'exécution.

C'est cohérent avec AWS Lambda, sur quoi reposent les fonctions Vercel : « Lambda
disables these features to ensure runtime stability ». Sur Lambda nu, un
`NODE_OPTIONS=--experimental-require-module` lève la désactivation ; sur Vercel,
un membre de l'équipe l'a proposé et cela n'a pas fonctionné, le drapeau
`--no-experimental-require-module` étant présent dans `process.execArgv`, qui
l'emporte sur `NODE_OPTIONS`.

**La correction : `firebase-admin` en 13.x.** C'est la dernière ligne dont la
chaîne ne dépend pas de `require(esm)` :

| Version | `jwks-rsa` | `jose` chargée |
|---|---|---|
| firebase-admin **14** | 4.x | v6, modules ES purs, aucune condition `require` |
| firebase-admin **13** | 3.x | v4, `dist/node/cjs/index.js` |

Ce n'est pas un `override` qui force une version contre la déclaration d'un
paquet : c'est une combinaison publiée et cohérente. Vérifié localement sous la
condition exacte de production :

```bash
node --no-experimental-require-module -e "import('firebase-admin/auth')"
```

Réenclencher la fonctionnalité aurait été plus élégant si c'était possible.
Ce ne l'est pas sur Vercel, et ce ne serait pas propre pour autant : AWS
désactive ces fonctionnalités « to ensure runtime stability », et les fonctions
qui les réactivent « aren't eligible for the Lambda Service Level Agreement ».
Dépendre d'un drapeau expérimental en production n'est pas une correction.

**Une seule version de `firebase-admin` dans le dépôt : 13.10.0, racine et
`functions/`.** Elles ont divergé un temps — `functions/` était restée en
14.3.0, au motif que le runtime Firebase n'a ni Turbopack ni la désactivation
de Vercel, et que rien ne justifiait de la rétrograder. **Ce raisonnement était
faux, et le premier déploiement de la fonction l'a montré.**

Le jour où `functions/src/index.ts` a eu besoin de lire un custom claim, il a
importé `firebase-admin/auth` — le seul point d'entrée qui tire
`jwks-rsa` → `jose`. En 14.3.0, `jwks-rsa@4.1.0` exige `jose@6`, qui est du
module ES pur ; en 13.10.0, `jwks-rsa@3.2.2` exige `jose@4`, qui est en
CommonJS. Le déploiement échouait alors sur :

```
Error: User code failed to load. Cannot determine backend specification.
Timeout after 10000.
```

**Les deux moitiés du message viennent d'une seule cause**, reproduite en
relançant la découverte des déclencheurs sous `--no-experimental-require-module` :
le runtime annonce `Serving at port`, le chargement du module lève
`ERR_REQUIRE_ESM` sur `jose` depuis `jwks-rsa/src/utils.js`, le serveur ne
répond donc jamais à `/__/functions.yaml`, et la CLI conclut au bout de dix
secondes. Après alignement sur 13.10.0, la même découverte répond en **716 ms
avec le drapeau, 646 à 850 ms sans**.

**Ce qu'il faut en retenir.** « Ce runtime-là n'a pas le problème » n'est pas
une garantie : le déploiement et l'exécution sont deux exécutants distincts,
et la découverte des déclencheurs tourne sur la machine du développeur. Tant
que la chaîne `jose` exige `require(esm)`, aucun des deux paquets n'y touche.
À remonter le jour où elle cessera de l'exiger — les deux ensemble.

**Reproduire la panne en local**, sur une machine à jour — c'est le seul moyen
de ne pas corriger à l'aveugle. Avec `firebase-admin` 14 la commande échouait,
avec la 13 elle passe :

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

**Déployer l'agrégation, et purger ses marqueurs.** Six gestes, et **l'ordre
n'est pas indicatif** : les deux derniers ne peuvent pas être faits plus tôt.

1. `npm run fonctions:deploy` — les fonctions se déploient depuis
   `functions/`, en `europe-west1`. **Pas `firebase deploy --only functions`
   directement** : le script desserre le délai de découverte, voir ci-dessous.
2. **Nettoyage des données de recette**, avant d'ouvrir l'application aux
   commerciaux : les réponses de test et `questionStats` partent ensemble. Voir
   section 3, « `questionStats` contient aujourd'hui des données de recette ».
3. **Rotation de la clé du compte de service**, en même temps que le nettoyage
   et avant l'ouverture aux commerciaux. Console Google Cloud → IAM et
   administration → Comptes de service → le compte de l'application → Clés :
   créer une clé JSON neuve, mettre à jour `FIREBASE_ADMIN_PRIVATE_KEY` dans
   `.env.local` **et** dans les variables Vercel, vérifier que l'application
   répond, puis supprimer l'ancienne clé. Dans cet ordre : supprimer d'abord
   couperait la production.

   **Pourquoi ce geste est dans cette liste.** Le 15 septembre 2026, la clé
   privée du compte de service s'est retrouvée **en clair dans la transcription
   locale d'une session Claude Code**, sous
   `~/.claude/projects/<projet>/<session>.jsonl`. Elle n'a été ni committée, ni
   publiée, ni envoyée à un tiers — mais elle a quitté le dossier des clés pour
   un dossier que personne ne surveille, et qui n'a jamais été pensé comme un
   coffre. Une clé de service se remplace en cinq minutes ; la question « qui a
   lu ce fichier » n'a pas de réponse facile.

   **La règle pratique qui va avec, et elle vaut pour tous les secrets.**
   *Ne pas laisser une ligne sélectionnée dans un fichier de secrets pendant
   qu'une session tourne.* L'intégration éditeur transmet **la sélection
   courante** avec chaque message — sans qu'on copie quoi que ce soit, et sans
   qu'on le demande. Un fichier simplement **ouvert** ne transmet que son
   chemin ; un fichier dont une ligne est **sélectionnée** transmet le contenu
   de cette ligne. La nuance ne se voit pas à l'écran, et c'est précisément ce
   qui la rend dangereuse. Fermer l'onglet, ou au minimum déplacer le curseur
   hors de la ligne, avant de lancer une session.

4. **Le premier commercial répond.** C'est la condition des deux gestes
   suivants, et elle n'a rien d'une formalité — voir plus bas.
5. `npm run stats:reprise -- --faire` — reconstruit les compteurs à partir des
   réponses en base. Il ne sert qu'à rattraper les réponses écrites pendant que
   la fonction était absente ou en panne. **Lancé avant l'étape 4, il vide
   `questionStats` au lieu de la reconstruire** : il écarte les comptes
   administrateurs, et il n'y a alors rien d'autre à compter. L'essai à blanc,
   sans `--faire`, montre l'écart avant d'écrire — le lire.
6. **Une stratégie TTL sur les marqueurs**, à créer une fois en console :
   *Firestore → Time-to-live (TTL) → Créer une stratégie*. Groupe de
   collections `evenements`, champ d'horodatage `expireLe`. Le groupe de
   collections, pas un chemin : les marqueurs vivent sous
   `questionStats/{questionId}/evenements`, et une stratégie TTL se déclare
   toujours au niveau du groupe. En ligne de commande, l'équivalent est
   `gcloud firestore fields ttls update expireLe --collection-group=evenements
   --enable-ttl --project=<id>`.

**Le délai de découverte, et un message qui ment.** Avant de déployer, la CLI
démarre un runtime local, charge le module compilé et lui demande la liste des
déclencheurs. Passé **dix secondes** — le défaut — elle abandonne sur :

```
Error: User code failed to load. Cannot determine backend specification.
Timeout after 10000.
```

**Ce message ne dit pas ce qu'il a l'air de dire.** Dans
`firebase-tools/lib/deploy/functions/runtimes/discovery/index.js`, « User code
failed to load » est un préfixe fixe, écrit aussi bien quand le module échoue
que quand il répond trop tard. Les deux cas se distinguent à un détail :
**quand le chargement échoue vraiment, la CLI ajoute la sortie d'erreur du
runtime** ; quand elle expire, il n'y a que « Timeout after ».

Ce piège a coûté deux diagnostics. La première fois, le message était juste —
`firebase-admin` 14 tirait `jose` en module ES, le runtime levait
`ERR_REQUIRE_ESM` et ne répondait jamais. La seconde, le même message
apparaissait alors que **le module chargeait en 386 à 776 ms et que la
découverte complète répondait en 877 à 1863 ms** : c'était la machine et le
lien, pas le code. `FUNCTIONS_DISCOVERY_TIMEOUT=60` a suffi à faire passer le
déploiement, ce qui l'a prouvé.

`npm run fonctions:deploy` fixe ce délai à deux minutes. **Il ne masque rien** :
une vraie panne de chargement produit une sortie d'erreur, pas une attente.
Avant de conclure à un problème de code sur ce message, relancer la découverte
seule et lire son journal — c'est la seule source qui distingue les deux causes.

**Pourquoi le TTL ne peut pas être posé le jour du déploiement.** La console
Firestore ne propose que les groupes de collections **qui existent déjà**, et
`evenements` n'existe qu'à partir du premier marqueur écrit. Or le marqueur
est posé dans la transaction d'agrégation, et l'agrégation s'arrête avant
pour un compte administrateur : tant que seule l'équipe pédagogique a répondu,
le groupe reste vide et la stratégie est impossible à créer. **Le TTL se pose
une fois qu'un vrai commercial a répondu au moins une fois, et pas avant.**

C'est une conséquence directe de l'exclusion des administrateurs, et elle est
sans gravité : aucun marqueur n'existe, donc rien ne s'accumule. Mais le geste
est facile à croire fait et à oublier — d'où sa place dans cette liste plutôt
que dans une note.

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

### Passer du back-office au parcours, et retour

Noémie écrit les explications qui s'affichent après chaque réponse. Sans les voir en situation, elle travaille à l'aveugle : l'application permet donc de traverser dans les deux sens. Le retour vers le back-office n'apparaît que pour un administrateur.

**Écart assumé avec les maquettes.** Aucune ne couvre ce passage. La forme retenue suit ce que font les outils qui séparent un mode auteur d'un mode lecteur — le passage se pose à côté de l'identité du produit, jamais dans la liste des sections, parce qu'une section est un endroit du même espace quand celle-ci change d'espace. Deux gestes, dans `src/composants/ds/Coquille.tsx` :

- **La marque nomme le contexte** — « Back-office » ou « Entraînement ». Elle affichait « Entraînement » partout, back-office compris. On ne sait pas qu'on peut passer ailleurs si l'on ne sait pas où l'on est.
- **Le passage est un contrôle bordé**, sous la marque, au-dessus des sections. Icône `eye` et « Voir le parcours » dans un sens, `pencil` et « Revenir au back-office » dans l'autre.

La première version lui donnait le fond `--surface-chip` : à l'écran, c'est exactement le traitement d'une entrée **active**, et le passage se lisait comme la section en cours. D'où la bordure complète sur fond transparent — jamais un filet d'un seul côté. Tout est bâti sur les jetons et la géométrie des entrées existantes ; **à faire tomber dans le système si le design repasse.**

Une conséquence à connaître : la bascule est un `<Link>`, donc chaque écran du back-office précharge le parcours et réciproquement — une requête de 1,4 ko par écran, pour un administrateur seulement. C'est ce qui rend la traversée instantanée.

**Une seule divergence assumée, et elle est de plomberie.** Les deux jetons de famille typographique ne portent plus le nom des polices mais les variables produites par `next/font` :

```css
--font-display: var(--police-display, Georgia, serif);
--font-sans: var(--police-sans, -apple-system, 'Segoe UI', sans-serif);
```

Ce sont les mêmes deux polices, Aileron et DM Serif Text, avec les mêmes graisses. Ce qui change est la façon de les charger — nom de fichier haché, préchargement, métriques de repli ajustées —, pas le dessin. La seconde valeur du `var()` est la pile de repli si les classes du layout racine manquaient. Aucune couleur, aucune échelle, aucun rayon ne s'écarte de l'import.

Les primitives sont dans `src/composants/ds/` : bouton, carte, champ, zone de texte, sélecteur, onglets, étiquettes, jeu d'icônes, états vides / chargement / erreur. Rembourrages, rayons et états sont ceux du bundle du système, pas des approximations. Les sept formes de la marque sont dans `public/formes/`, déjà teintées : le repère d'une formation est sa forme, jamais une puce colorée.

### Les deux polices : d'où elles viennent, comment on les prépare

Aileron et DM Serif Text sont fournies par le système de design **en `.ttf`**, qui est un format d'installation système, pas un format de livraison web. Le dépôt garde les deux états, et ils ne se confondent pas :

| Dossier | Contenu | Servi ? |
|---|---|---|
| `polices-source/` | les six `.ttf` livrés par le design | non, jamais |
| `src/polices/` | les six `.woff2` sous-ensemblés, produits par le script | oui, via `next/font` |

**Refaire la conversion** — le jour où le design livre une face de plus, ou corrige un dessin :

```bash
py -m pip install fonttools brotli     # une seule fois
py scripts/convertir-polices.py
```

Le script sous-ensemble chaque face au latin de base, au latin-1 et à ce que la typographie française ajoute en propre (`œ`, `Œ`, `Ÿ`, guillemets courbes, tirets, points de suspension, euro), puis empaquette en woff2. Mesuré sur les six faces : **675 ko de `.ttf` deviennent 117 ko de `.woff2`, soit 83 % de moins.** Aileron seule passe de 149 ko à 18 ko — la police embarquait des alphabets grec et cyrillique dont l'application n'affiche pas un caractère.

Trois étapes, pas une : déposer le `.ttf` dans `polices-source/`, l'ajouter à `FACES` dans le script, le déclarer dans `src/styles/polices.ts`. Les `.woff2` produits sont versionnés — Vercel ne fait pas tourner Python, il sert ce que le dépôt contient.

**Le chargement passe par `next/font/local`** (`src/styles/polices.ts`), pas par des `@font-face` écrits à la main. Ce n'est pas un détail de style : `public/` est servi par Vercel avec `Cache-Control: public, max-age=0, must-revalidate`, quand `/_next/static` reçoit `immutable` pour un an. Tant que les polices étaient dans `public/`, un commercial qui revenait trois fois par semaine repayait 177 ko à chaque visite. `next/font` émet les fichiers sous un nom haché — donc cachables définitivement —, injecte le préchargement dans le `<head>`, pose `font-display: swap` et aligne les métriques de la police de repli sur la police finale, ce qui supprime le saut au moment du swap.

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

`/animer` — vue animatrice, projetée. `/session` — vue participant, sur son propre appareil.

**Contrainte hybride.** Une partie des participants est en visioconférence et voit l'écran partagé avec plusieurs secondes de retard. La question est poussée sur l'appareil de chacun par un écouteur Firestore temps réel. Ne jamais dépendre de la projection. **Le chronomètre suit la même règle** : la session porte `questionOuverteLe`, un instant, et non une durée démarrée à l'arrivée — sinon un retardataire aurait plus de temps que les autres. Il cadence, il ne ferme pas : ce qui ferme le vote est la révélation, vérifiée côté serveur.

**L'écran d'animation vit hors de la coquille du back-office.** Il est projeté sur un mur : une barre latérale y prendrait 232 pixels pour afficher des liens que personne ne cliquera. Les tailles y viennent de la distance de lecture — question jusqu'à 56 px, options jusqu'à 26 px — et non de l'échelle typographique. La scène est un composant qui ne reçoit que ses données (`SceneProjetee`) : un écran qu'on ne peut vérifier qu'en séance réelle est un écran qu'on ne vérifie jamais.

**Trois situations traitées explicitement, parce qu'elles arrivent.**

| | Ce qui se passe |
|---|---|
| Un participant arrive au milieu | L'écouteur lui donne l'état courant, sans rattrapage. Si la réponse est déjà révélée, il voit la correction et **ne peut pas voter** — les règles le refusent. |
| L'animatrice ferme son onglet | Rien. Tout l'état vit dans Firestore ; elle retrouve sa séance en rouvrant, à la question près. C'est ce qui interdit de garder le compteur de réponses dans son navigateur. |
| Un participant perd la connexion | `onSnapshot` reconnecte seul. `fromCache` sert à l'annoncer plutôt qu'à afficher une question périmée en silence. Une réponse partie hors ligne est rejouée — et refusée si la révélation a eu lieu entretemps, ce que l'écran dit. |

**Le compteur de réponses est tenu par une Cloud Function.** Un participant ne peut pas compter lui-même — il ne lit pas les réponses des autres, et c'est voulu. Le faire écrire par l'animatrice l'aurait lié à son onglet. Le déclencheur `compterReponseSession` incrémente `repondants` sur la séance, et **n'agrège rien** : agréger là compterait chaque réponse deux fois, puisque le participant écrit aussi sous `users/{uid}/reponses`.

### Classement de séance et prix

**Le tableau meurt avec la séance, le trophée reste.**

- **Le classement** est nominatif, il vit sous `sessions/{id}/classement/final`, et **seuls ceux qui étaient là le lisent** : les règles exigent un marqueur de présence, créable uniquement pendant la séance. On ne s'inscrit pas après coup pour lire le tableau.
- **Le prix** vit sous `users/{uid}/prix/{sessionId}`, privé à son porteur, et s'affiche sur l'accueil à côté des étoiles. Les étoiles disent l'assiduité, les prix disent les jeudis.

**Aux points, et rien d'autre.** Premier, Diamant ; deuxième, Or ; troisième, Argent ; sans condition de score — dans une finale de cent mètres, le premier prend l'or même s'il court en seize secondes. À égalité, la vitesse départage : on somme les instants de réponse. Le quatrième et les suivants n'ont pas de distinction, et **personne ne le sait** — mais chacun retrouve son rang dans son historique.

**Aucun client n'écrit ces documents**, pas même leur propriétaire : `allow write: if false`. Seule la Cloud Function `classerSessionTerminee` écrit, à partir des réponses. Un prix qu'on peut s'attribuer ne vaut rien. Rien n'entre dans `questionStats` : les statistiques disent quelles questions font trébucher l'équipe, jamais qui a gagné.

**Le nom d'affichage** se choisit au moment de rejoindre, pas dans un écran de réglages — personne n'ouvrirait un réglage avant le jeudi. Il est prérempli avec le choix de la fois précédente, borné à 32 caractères parce qu'il s'affiche sur un mur, et c'est **le participant lui-même qui le publie** : sans cela l'animatrice ne pourrait pas nommer les votes, `users/{uid}` lui étant fermé sans exception.

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

### La vérification en intégration continue

`.github/workflows/verification.yml` rejoue `lint`, `typecheck`, `build`, le
build de `functions/` et les deux jeux de tests sur chaque poussée, dans un
environnement neuf : dépendances installées par `npm ci` depuis les fichiers de
verrouillage, racine **et** `functions/`.

**Deux points étaient laissés à trancher. Les voici tranchés.**

**Quels secrets exposer : aucun.** Le build échoue sans les variables
d'environnement — il valide la configuration en collectant les données de page
— mais il ne s'en sert que pour la valider : aucune requête ne part vers
Firebase, Airtable ou reCAPTCHA pendant `next build`. Vérifié en retirant
`.env.local` et en ne fournissant que des valeurs factices : le build passe ; en
en retirant une, il échoue en nommant la variable. Le workflow porte donc des
valeurs visiblement fausses, écrites en clair. Un secret exposé à un workflow
est lisible par toute action tierce qu'on y ajouterait un jour, et une
vérification qui ne peut rien exfiltrer est une vérification qu'on laisse
tourner sur chaque branche sans y penser.

Effet de bord utile : **le build devient un test du contrat d'environnement.**
Ajouter une variable exigée sans l'ajouter au workflow, à `.env.example` et à
Vercel rend la vérification rouge tout de suite, au lieu du premier chargement
en production.

**La vérification des règles publiées : dehors, et dans son propre workflow.**
Elle compare une branche à la production. Or une branche de lot qui modifie
`firestore.rules` en diffère légitimement — le déploiement vient après la
fusion. L'y mettre rendrait la vérification rouge pour une bonne raison, et une
vérification rouge pour une bonne raison finit par ne plus être lue. Elle exige
en outre un vrai secret, ce qui ferait perdre la propriété ci-dessus.

`.github/workflows/regles-publiees.yml` la fait donc tourner seule, sur `main`,
tous les jours à 06:00 UTC, plus à la demande. Trois secrets de dépôt à créer :
`FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`,
`FIREBASE_ADMIN_PRIVATE_KEY` — un compte de service en lecture seule, rôle
« Lecteur des règles Firebase ». Elle ne remplace pas `npm run regles:deploy`,
qui vérifie déjà après déploiement ; elle rattrape ce que ce geste ne voit pas :
un déploiement oublié, et une modification faite à la main dans la console.

### Les tests de bout en bout des Cloud Functions

`tests/fonctions/declencheurs.test.ts` — douze tests, les trois déclencheurs
exercés comme en production : on écrit dans Firestore et on attend ce qui doit
en sortir. Les émulateurs Firestore, Auth et Functions tournent ensemble, le
module compilé de `functions/` est chargé, les vrais déclencheurs sont
enregistrés.

Ce qui manquait n'était pas le calcul — `classer`, `bilanDesReponses`,
`doitCompter`, `agreger` avaient leurs tests — mais **le déclenchement** et
**l'écriture**. Le bilan, en particulier, n'avait jamais tourné une seule fois,
ni en local ni en production.

**Coût mesuré : deux minutes**, dont treize secondes de démarrage à froid sur le
premier déclenchement. Trop pour `npm test`, qu'on relance vingt fois par heure.
D'où trois commandes :

```bash
npm test             # règles et dépôts, émulateur Firestore seul — 45 s
npm run test:fonctions   # les trois déclencheurs, trois émulateurs — 2 min
npm run test:tout        # les deux, ce que fait l'intégration continue
```

Deux pièges rencontrés en les écrivant, tous deux consignés dans le code :

- **La découverte des fonctions expire au réglage par défaut.** Dix secondes ne
  suffisent pas ici, et le message est le préfixe fixe déjà connu — « User code
  failed to load. Cannot determine backend specification. »
  `scripts/tester-fonctions.mjs` desserre le délai, comme `fonctions:deploy`.
- **Une sonde qui ne se déclenche pas doit échouer, pas se taire.** La première
  version rendait « rien ne s'est déclenché » alors que le module n'avait pas
  chargé du tout : le même symptôme pour deux causes opposées. L'attente lève
  désormais, avec un message qui renvoie au journal de l'émulateur. Vérifié en
  cassant volontairement l'écriture du bilan : le jeu de tests devient rouge et
  dit lequel.

### Le nettoyage des données de recette

`npm run recette:nettoyer` — **le script est écrit, il n'a pas été exécuté.**

Essai à blanc par défaut : il liste ce qui partirait, groupé et reconnaissable
— adresses, codes de séance avec leur statut, énoncés —, et ne touche à rien.
Deux barrières pour exécuter : `--confirmer=EFFACER`, puis la saisie du nom du
projet à la main, après avoir lu la liste. Firestore n'a pas de corbeille.

Périmètres séparés : `--progression`, `--seances`, `--statistiques`,
`--synchros`, et `--questions=toutes` ou `--questions=<id>,<id>`. **Aucune
question n'est supprimée sans être nommée** : la banque contient déjà du travail
de Noémie, et rien dans un document ne distingue un essai d'une vraie question.

Ne sont pas touchés : `formations`, qui se reconstruit par synchronisation, et
les comptes Firebase Authentication avec leurs custom claims — les supprimer
ferait perdre le rôle administrateur, qui ne se réattribue pas tout seul.

La séance `CPY68N` restée `encours` apparaît dans l'essai à blanc, signalée
« jamais close ».

### Le préchargement après une déconnexion : le diagnostic était faux

Ce candidat annonçait que les requêtes de préchargement arrivant après une
déconnexion faisaient lever une `ErreurAcces` écrite dans les journaux Vercel.
**Reproduit sur le build de production, ce n'est pas ce qui se passe.** Une
requête de préchargement sans cookie reçoit un 307 et **n'écrit rien** : Next la
traite sans passer par `onRequestError`.

Ce qui écrivait, en revanche, et que personne n'avait vu : **chaque visite
anonyme de l'accueil et de la série**, préchargement ou non. `chargerReferentiel`
portait le commentaire « les dispositions rendent alors l'écran de connexion, et
cette lecture n'a pas lieu ». Elle a lieu : Next évalue la disposition et la page
du même segment en parallèle. La disposition décidait bien de rendre l'écran de
connexion, mais la page avait déjà démarré et pris l'`ErreurAcces` en pleine
figure — avec sa pile, sur l'écran le plus visité de l'outil, le premier qu'un
commercial voit.

Correction : les pages appellent `chargerReferentielSiConnecte`, qui rend `null`
quand personne n'est connecté. Le garde de `chargerReferentiel` reste et lève
toujours — il protège l'autre cas, celui d'une page qui servirait le catalogue à
un visiteur anonyme. S'il se déclenche désormais, c'est un vrai défaut.

Mesuré sur les huit écrans, sans cookie, avant et après : **quatre lignes
d'erreur pour six requêtes, puis zéro pour huit.**

### Les écrans de limite, qui n'existaient pas

Le dépôt ne portait ni `error.tsx`, ni `global-error.tsx`, ni `not-found.tsx`.
Une panne dans une page rendait donc l'écran par défaut de Next — en production,
« Application error: a server-side exception has occurred », en anglais, sans
marque et sans issue. `EtatErreur` existait dans le système de design et aucune
frontière ne s'en servait.

Quatre écrans ajoutés, tous vérifiés au navigateur à 375 pixels :

- `src/app/error.tsx` — la frontière racine. Elle attrape aussi les
  **dispositions** de `(parcours)`, `admin`, `serie` et `animer`, qu'une
  frontière de segment ne rattrape pas : c'est le chemin de
  `ErreurVerificationIdentite`, la panne qui a coûté deux déploiements.
- `src/app/(parcours)/error.tsx` et `src/app/admin/error.tsx` — la coquille
  reste à l'écran, et l'on passe à un autre écran par la navigation. Le texte
  diffère : côté commercial on rassure sur les réponses enregistrées, côté
  back-office sur la saisie en cours, qui elle n'a pas été envoyée.
- `src/app/global-error.tsx` — la dernière frontière, sans dépendance à
  `systeme.css` ni aux polices, puisqu'elle remplace `<html>`.
- `src/app/not-found.tsx` — un état vide, pas une erreur : rien n'est cassé.

**Le digest est affiché.** En production, Next n'envoie ni le message ni la pile
au navigateur, seulement cet identifiant — le même que celui des journaux
serveur. C'est la seule chose qu'un commercial puisse lire à voix haute pour
qu'on retrouve sa panne.

Piège de version rencontré : dans cette version de Next, la frontière reçoit
`error` et **`retry`** — pas `reset`. Traduire les noms dans la signature
revenait à recevoir `undefined` des deux côtés, et l'écran par défaut
s'affichait quand même. Vérifié à l'écran avant et après.

**La régression de poids, annoncée.** Une frontière d'erreur est un composant
client, et celle de la racine enveloppe toutes les routes : ce qu'elle importe
entre dans le fragment initial de **chaque** écran. La première version
s'appuyait sur `EtatErreur` et `Bouton` du système : mesuré, **+16,6 ko
transférés partout**, écran de connexion compris. Les écrans de limite ont donc
été rendus autonomes — mêmes jetons, mêmes formes, mais aucune dépendance vers
`primitives` ni `etats` — ce qui a rendu 6,5 ko.

Solde assumé : **300,7 → 310,8 ko transférés, 181,8 → 191,9 ko de JS, soit
+10,1 ko sur chaque écran** (build de production servi en local, gzip, même
appareil de mesure qu'au lot 7). CLS 0. C'est le prix d'un écran de panne en
français, sur la marque, avec une référence traçable, et d'un vrai 404. Le
signaler fait partie du marché : une régression annoncée est un arbitrage.

### L'échelle des largeurs

Cinq seuils de requête de média, dont deux à soixante pixels l'un de l'autre
pour la même intention, et le seuil de la coquille écrit dans trois blocs
séparés. Ramenés à quatre — 1200, 1040, 900, 760 —, chacun nommé et expliqué une
fois en tête de `src/styles/systeme.css`, les blocs fusionnés. Une requête de
média n'accepte pas `var()` : les nombres restent répétés, mais on sait
désormais ce que chacun veut dire.

### Les pannes du navigateur remontent enfin

`onRequestError` couvrait le serveur. Une panne dans un composant client —
l'éditeur, l'écran de séance, la révélation du classement — n'écrivait que dans
la console du commercial. C'est la moitié qui tourne le jeudi, sur dix
téléphones, et les trois défauts trouvés en séance réelle au lot 7 vivaient
tous de ce côté-là.

**Pourquoi pas Sentry.** Mesuré sur le paquet CDN de la version 10.74 : le
bundle navigateur minimal pèse **29,8 ko gzip**, trois fois la régression
consentie pour les écrans de panne eux-mêmes, sur chaque écran. Et il collecte
par défaut ce qu'on ne veut surtout pas remonter — le texte des éléments
cliqués, les valeurs de formulaire, les corps de requête. Le désarmer champ par
champ est une politique à écrire puis à maintenir à chaque montée de version.
Pour dix utilisateurs, une seule application et un journal serveur déjà collecté
par Vercel, le rapport n'y est pas.

**Ce qui a été construit à la place**, pour **1,0 ko mesuré** :

- `src/lib/journal/redaction.ts` — l'expurgation, pure et testée : adresses,
  chemins `users/{uid}`, jetons. Elle tourne deux fois, dans le navigateur puis
  sur le serveur, parce qu'un client ne se croit pas sur parole.
- `src/lib/journal/client.ts` — l'envoi, avec déduplication, plafond de cinq
  signalements par chargement et `sendBeacon` pour survivre à la navigation.
- `src/composants/journal/SondeErreurs.tsx` — `error` et `unhandledrejection`,
  montés par la disposition racine. C'est la moitié qu'aucune frontière React
  n'attrape : gestionnaires, effets, promesses rejetées.
- `src/app/api/journal-client/route.ts` — la route. Session exigée, réponse
  `204` uniforme, écriture sur la sortie d'erreur que Vercel collecte déjà.

**Cinq champs partent, et rien d'autre** : origine, message borné à 300
caractères, six lignes de pile, le chemin de l'écran **sans sa chaîne de
requête**, et le digest. Aucune valeur de formulaire, aucun contenu de
document, aucun corps de requête, aucune capture.

**Aucun identifiant d'utilisateur n'est journalisé** : le rôle suffit. C'est la
même décision que dans `agregerReponseEntrainement`, prise pour la même raison.

Vérifié de bout en bout dans un vrai navigateur : une promesse rejetée portant
`users/uid-jordan-4f7b2c/reponses/q-vf_1789 pour jordan@medere.fr` part en
`users/[uid]/reponses/q-vf_1789 pour [adresse]`, dans le message **comme dans la
pile** ; la même panne envoyée deux fois n'en produit qu'un signalement ; une
exception dans un `setTimeout` est bien capturée ; un envoi sans session
n'écrit rien.

### La session ne se redemande plus chaque semaine

`DUREE_SESSION_MS` passe de cinq à **quatorze jours** — le maximum qu'accepte
Firebase — et le cookie se **renouvelle en glissant**, à mi-vie.

Un cookie de session Firebase ne se prolonge pas côté serveur : il se
refabrique à partir d'un jeton d'identité frais, que seul le navigateur peut
produire. Le serveur constate donc (`renouvellementConseille`, calculé sur
l'`exp` du jeton) et le navigateur agit, dans `GardeNavigateur`. Le drapeau
voyage avec la page que les dispositions rendent déjà : **le cas courant ne
coûte aucune requête supplémentaire**, et le renouvellement lui-même n'arrive
qu'une visite sur deux pour qui vient une fois par semaine.

Effet de bord utile : le renouvellement repasse par le chemin d'ouverture de
session, donc il repose le custom claim. Un rôle qui change prend effet à la
visite suivante, sans reconnexion — le piège des « custom claims non
rafraîchis » perd son mordant.

### Les secrets du workflow `regles-publiees.yml`

À créer une fois, dans *Settings → Secrets and variables → Actions → New
repository secret* du dépôt `medere-tech/medere-quiz-commerciaux` :

| Nom | Valeur |
| --- | --- |
| `FIREBASE_ADMIN_PROJECT_ID` | l'identifiant du projet Firebase |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | `client_email` du compte de service |
| `FIREBASE_ADMIN_PRIVATE_KEY` | `private_key`, **collée telle quelle**, retours à la ligne compris |

Le compte de service n'a besoin que de lire : rôle **Lecteur des règles
Firebase** (`roles/firebaserules.viewer`), et rien d'autre. Lui donner
l'écriture ferait de ce workflow un chemin de déploiement, ce qu'il n'est pas.

Un compte dédié vaut mieux que celui de l'application : il se révoque sans
couper la production. *Console Google Cloud → IAM et administration → Comptes de
service → Créer*, puis *Clés → Ajouter une clé → JSON*.

Vérification après création : *Actions → Règles publiées → Run workflow*. Le
journal doit finir sur « Les règles déployées sont exactement celles du dépôt. »

---

### Le référentiel n'est plus servi en entier

**Deux versions, et le choix se fait par écran.** `chargerReferentiel` rend
désormais des questions de **liste** — tout sauf `options`, `ordreOptions`,
`bonnesReponses`, `explication`, `contexte` et les champs de source. Un
`select()` borne aussi ce que Firestore transporte jusqu'au serveur.
`chargerReferentielComplet` rend le contenu, et un seul écran l'appelle : la
série, qui pose les questions.

**Les deux écrans de séance ne reçoivent plus rien.** Ils recevaient la banque
publiée entière pour n'y chercher qu'une question à la fois, en secours de
l'écouteur temps réel — qui fait autorité de toute façon et répond en quelques
dizaines de millisecondes. Le secours coûtait plus qu'il ne servait. Il a fallu
en revanche distinguer trois états là où il y en avait deux : tant que
l'écouteur n'a pas parlé, on attend ; quand il rend `null`, la question n'est
plus publiée. Afficher « question indisponible » pendant l'attente aurait été un
mensonge, sur l'écran de dix téléphones un jeudi.

**Ce que ça donne, mesuré sur un écran AUTHENTIFIÉ** — build de production servi
localement, émulateurs Firestore et Auth, vrai cookie de session, document HTML
encodé :

| banque publiée | accueil et à revoir | série | séance |
| --- | --- | --- | --- |
| 150 questions | **16,5 ko** | 34,9 ko | **5,3 ko** |
| 500 questions | 34,1 ko | 94,2 ko | 3,8 ko |

Avant, les quatre écrans se comportaient comme la colonne « série ». La séance
est désormais **constante** : elle ne dépend plus de la taille de la banque.

**Pourquoi la série garde le contenu complet, pour l'instant.** Le tirage est
pondéré par la maîtrise, qui est privée et lue par le navigateur : le serveur ne
sait pas quelles dix questions il devra servir. L'alternative — tirer, puis
aller chercher le contenu des dix — échange quelques dizaines de kilo-octets
contre **un aller-retour supplémentaire avant la première question**. À 150
questions, l'économie vaut environ 25 ms de transfert en 4G contre 200 à 400 ms
d'aller-retour : le compte n'y est pas. Il y sera vers 600 à 800 questions.
**C'est le seuil à surveiller**, et c'est le seul endroit du parcours où la
taille de la banque compte encore.

### Ce que pèse vraiment un écran, et ce que je mesurais jusqu'ici

**Les chiffres annoncés aux lots 7 et 8 — « 310,8 ko » — ne mesuraient pas ce
qu'ils prétendaient.** Deux erreurs cumulées :

1. Ils portaient sur l'**écran de connexion**, faute de cookie. Un commercial ne
   le voit qu'une fois tous les quatorze jours.
2. L'outil de mesure ne recomposait que les fragments statiques de
   l'application trouvés sur le disque. **Les ressources tierces et le document
   HTML n'y entraient pas.**

Mesure refaite, même appareil, cookie de session valable, banque de 150
questions, première visite, cache vide :

| | connexion | accueil authentifié |
| --- | --- | --- |
| tiers Google (reCAPTCHA, App Check) | 390,9 ko | 390,9 ko |
| scripts de l'application | 198,0 ko | 372,8 ko |
| polices | 118,3 ko | 118,3 ko |
| document | 4,6 ko | 16,5 ko |
| **total transféré** | **715,1 ko** | **903,9 ko** |

Les écarts annoncés lot après lot restent justes — ils étaient mesurés de façon
cohérente entre eux. **La valeur absolue, elle, était fausse d'un facteur trois.**

**À partir de maintenant, toute mesure de poids se fait sur un écran
authentifié, avec une banque réaliste, et dit lequel.** Le harnais est dans le
bac à sable : `COOKIE_SESSION` posé en variable d'environnement, `mesure-cdp.mjs`
l'envoie en en-tête.

**Deux postes dominent, et aucun n'est ce que ce projet a optimisé jusqu'ici :**
les 390,9 ko de reCAPTCHA Enterprise, imposés par App Check et non négociables
sans revenir sur cette décision ; et les 118,3 ko de polices, six faces
préchargées. Tous deux sont `immutable` ou mis en cache par le tiers : ils se
paient à la première visite, pas le jeudi suivant. **Candidat pour le lot 9 :
mesurer la seconde visite, qui est le vrai régime d'usage.**

### Les premiers tests d'écran

`tests/ecrans/session-participant.test.tsx` — dix-neuf tests sur
`SessionParticipant`, l'écran des dix téléphones. Vitest, déjà là,
`@testing-library/react` et `happy-dom` en plus ; pas d'émulateur, quelques
secondes d'exécution.

**Ils répondent à la troisième question**, celle qu'aucun test ne posait : les
règles disent ce qu'on a le droit d'écrire, le dépôt ce qu'on écrit, ceux-ci ce
qui s'affiche. Cet écran croise cinq statuts de séance avec cinq états de vote ;
six combinaisons au plus avaient jamais été vues à la main.

**Règle de rédaction : par rôle et par texte visible, jamais par classe ni par
structure.** Une seule entorse a été nécessaire et elle est instructive :
chercher le nom « Jordan » par chaîne exacte échoue, parce qu'il partage son
nœud de texte avec « · vous ». Le motif `/Jordan/` interroge ce que la personne
lit ; la chaîne exacte interrogeait la composition de la phrase.

**Deux constats de l'écriture même de ces tests :**

- La révélation du classement dure plusieurs secondes — c'est l'exception
  assumée à `prefers-reduced-motion`. Le test **attend la mise en scène** au
  lieu de la désarmer : désarmer reviendrait à vérifier un écran que personne ne
  verra.
- Un test écrit depuis la règle du QCM multiple a échoué, et il avait raison de
  le faire. Voir ci-dessous.

### La consigne du QCM multiple

Une ligne au-dessus des options, sur les **trois** écrans qui posent une
question — la série, la séance côté participant, l'écran projeté :

> Plusieurs réponses attendues — une réponse incomplète est comptée fausse.

Le groupe d'options porte `role="group"`, un nom et un `aria-describedby` qui
désigne cette consigne : elle est annoncée une fois à l'entrée du groupe, pas
répétée à chaque option. Composants `ConsigneReponses` et `GroupeDeReponses`.

**Ajout hors maquette, documenté dans `docs/design-imports.md`.** La seule
distinction prévue était la forme du marqueur — carré au lieu de rond. Elle ne
suffit pas : la règle est la moins devinable de l'outil, le public la découvre
un jeudi sur son téléphone, et pour un lecteur d'écran la forme d'un marqueur
`aria-hidden` n'existe pas.

**Trouvé par un test d'écran** écrit depuis le modèle et non depuis l'écran : il
a échoué en ayant raison.

**L'étiquette de type suit.** Elle affichait « Choix multiples » pour **tout**
QCM, y compris ceux qui n'ont qu'une bonne réponse : l'écran pouvait donc dire
« CHOIX MULTIPLES » trois lignes au-dessus de « Une seule réponse. »
L'étiquette créait l'ambiguïté que la consigne venait de lever. Sur les trois
écrans qui posent une question, elle dit désormais le nombre de réponses
attendues — « Une réponse », « Plusieurs réponses », « Vrai ou faux »
inchangé. Les listes et l'éditeur gardent `LIBELLES_TYPE` : c'est là qu'un nom
de format a sa place, et une question de liste ne porte pas ses bonnes
réponses de toute façon.

**Les titres des états vides et des erreurs sont devenus des titres.**
`EtatVide` et `EtatErreur` rendaient leur intitulé dans un `<span>` : un
lecteur d'écran qui navigue de titre en titre ne s'y arrêtait jamais, sur les
écrans mêmes où l'on cherche à comprendre ce qui se passe. Passés en `<h2>`,
sans aucun changement d'affichage — vérifié à la capture.

### Les tests d'écran, suite

| Fichier | Écran | Tests |
| --- | --- | --- |
| `session-participant.test.tsx` | 10a · séance, côté commercial | 22 |
| `serie.test.tsx` | 02–04 · la série et la correction | 14 |
| `scene-projetee.test.tsx` | 10b · l'écran projeté | 5 |

La série et la correction couvrent ce qui se paie en points : l'ensemble
sélectionné part entier, une réponse partielle est comptée fausse **et montre
ce qui manquait**, l'explication s'affiche, une panne d'écriture n'empêche pas
d'avancer mais se dit, le clavier fait le même travail que la souris, et
quitter une série engagée demande confirmation en annonçant ce que ça coûte.

**Sur la fragilité, verdict après trois écrans :** aucun test n'a eu besoin de
connaître une classe, une balise ou une hiérarchie. Trois ajustements ont été
nécessaires, tous instructifs plutôt que gênants :

- chercher un nom par chaîne exacte échoue quand il partage son nœud de texte
  avec autre chose (« Jordan · vous ») — le motif interroge ce qu'on lit, la
  chaîne exacte interrogeait la composition de la phrase ;
- attendre la correction par son texte est ambigu quand deux éléments le
  portent ; attendre le **bouton** qui n'apparaît qu'à ce moment-là ne l'est
  pas ;
- une assertion écrite de mémoire sur le libellé de confirmation était fausse :
  l'écran dit « Série abandonnée : aucune étoile », ce qui est mieux.

La révélation du classement dure plusieurs secondes — l'exception assumée à
`prefers-reduced-motion`. Le test **attend la mise en scène** au lieu de la
désarmer : désarmer reviendrait à vérifier un écran que personne ne verra.

### Candidats pour le lot 9

**Mesurer la seconde visite.** Toutes les mesures de ce projet portent sur une
première visite, cache vide. Ce n'est pas le régime d'usage : un commercial
revient chaque jeudi, et les fragments statiques comme les polices sont
`immutable`. Le chiffre qui compte — ce que coûte l'ouverture de l'outil entre
deux appels, la deuxième fois — n'a jamais été relevé sur un écran authentifié.

**Et si la performance doit être reprise, c'est là qu'il faudra regarder :**

| poste | poids | remarque |
| --- | --- | --- |
| tiers Google (reCAPTCHA, App Check) | **390,9 ko** | imposé par App Check ; le remettre en cause est une décision de sécurité, pas d'optimisation |
| polices | **118,3 ko** | six faces préchargées, déjà sous-ensemblées en woff2 |

**Ces deux postes pèsent plus que tout ce que les lots 7, 8 et 9 ont
optimisé réuni.** Les scripts de l'application, eux, sont à 372,8 ko sur un
écran authentifié. Tant qu'on n'a pas mesuré la seconde visite, on ne sait pas
lequel des trois mérite le travail.

---

### Reste à faire, hors dépôt

Un seul geste, et il ne peut pas être fait plus tôt : la stratégie TTL sur
`questionStats/{questionId}/evenements` (section 4, geste 6) attend qu'un vrai
commercial ait répondu — le groupe de collections doit exister pour que la
console accepte de la créer.

Les trois autres gestes de mise en service — déploiement des fonctions,
nettoyage des données de recette, rotation de la clé de service — sont prêts et
documentés ; ils se font le jour de l'ouverture.

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
