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
formations/{formationId}
  airtableId, nom, cible, format : string
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
  creeeLe, modifieeLe : timestamp
  creeePar : string

users/{uid}
  email, nom, photoURL : string
  role : 'commercial' | 'admin'    // affichage seulement, jamais autorisation
  etoiles, seriesTerminees : number
  creeLe, vuLe : timestamp

users/{uid}/reponses/{reponseId}
  questionId : string
  correcte : boolean
  optionsChoisies : string[]
  origine : 'entrainement' | 'session'
  repondueLe : timestamp

questionStats/{questionId}         // agrégat anonyme, écrit par Cloud Function
  tentatives, echecs : number
  majLe : timestamp

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

**Pourquoi les réponses sont sous le document utilisateur.** C'est ce qui rend l'isolation des scores applicable par les règles de sécurité, et pas seulement par un filtre d'affichage. Noémie ne peut pas voir qui rate quoi, même en ouvrant la console Firebase. Elle voit les statistiques par question via `questionStats`, qui ne contient aucun identifiant.

Cette décision peut être révisée si Noémie ou la direction demandent le nominatif. C'est alors une décision managériale explicite, à assumer comme telle, avec une évolution du modèle. Ne pas l'anticiper dans le code.

**Pourquoi les options sont une map et non une liste.** Les règles de sécurité ne savent pas parcourir une liste. Avec `options : [{ id, texte }]`, vérifier que chaque bonne réponse désigne une option existante obligeait à énumérer les positions une à une, donc à plafonner arbitrairement le nombre d'options. La map expose ses clés d'un bloc : `bonnesReponses.toSet().hasOnly(options.keys().toSet())` valide l'ensemble sans limite de taille. L'ordre d'affichage, que la map ne conserve pas, passe dans `ordreOptions`, dont les règles vérifient qu'il décrit exactement les mêmes identifiants.

### Index

`firestore.indexes.json` est versionné et déployé avec `firebase deploy --only firestore:indexes`. Il couvre les requêtes prévues aux lots suivants :

| Collection | Champs | Sert à |
|---|---|---|
| `questions` | `statut` + `formationIds` | le tirage des séries, restreint aux publiées d'une formation (lot 5) |
| `questions` | `statut` / `type` / `formationIds`, puis `modifieeLe` décroissant | les filtres du back-office, seuls ou combinés (lot 3) |
| `formations` | `actif` + `nom` | la liste des formations actives, par ordre alphabétique |
| `reponses` | `questionId` + `repondueLe` décroissant | retrouver la dernière tentative sur une question, pour la pondération du tirage |
| `reponses` | `correcte` + `repondueLe` décroissant | l'écran « revoir mes questions ratées » |
| `reponses` | `origine` + `repondueLe` décroissant | distinguer entraînement et session dans l'historique |
| `sessions` | `statut` + `creeeLe` décroissant | retrouver la session en cours |

Les dérogations (`fieldOverrides`) désactivent l'indexation automatique de `options`, `ordreOptions`, `bonnesReponses`, `optionsChoisies`, `enonce`, `explication` et `contexte`. Aucune requête ne les filtre — la recherche sur l'énoncé se fait dans le navigateur, sur une banque de quelques centaines de questions. Pour `options`, la raison est plus forte : chaque clé de map crée sinon son propre chemin indexé, et une banque de questions aux identifiants d'options variés ferait enfler l'index sans qu'aucune lecture n'en profite.

Les index à champ unique restent automatiques : `sessions.code`, `questionStats.echecs` et les autres tris simples n'ont rien à déclarer ici.

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
- **Questions.** Explication et énoncé non vides, type parmi `vf`/`qcm`/`scenario`, `formationIds` non vide et sans doublon, difficulté dans 1-3, statut parmi `brouillon`/`publiee`. Le contexte est obligatoire pour une mise en situation et interdit ailleurs. `bonnesReponses` désigne des options existantes, `ordreOptions` décrit exactement les clés de la map. L'auteur ne peut être que celui qui écrit, et `creeePar` comme `creeeLe` ne sont plus modifiables ensuite.
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
| `questions.creeePar`, `sessions.animateurUid`, `reponses.uid`, `reponses.questionId` | 128 | longueur maximale d'un identifiant Firebase Authentication ; un identifiant Firestore généré en fait 20 |
| `formations.airtableId` | 64 | un identifiant d'enregistrement Airtable en fait 17 |
| `formations.nom` | 200 | un intitulé de formation DPC |
| `formations.cible`, `formations.format` | 60 | libellés courts, issus du référentiel |
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

**Prérequis : revalider la forme côté serveur.** La synchronisation écrit avec le SDK Admin, qui n'est pas soumis aux règles de sécurité. Les contraintes de forme des `formations` — jeu de champs exact, textes non vides, plafonds de 64 caractères pour `airtableId`, 200 pour `nom`, 60 pour `cible` et `format`, `actif` booléen, `syncLe` non postérieur à l'instant courant — ne s'appliquent donc pas à elle. **Elles doivent être réécrites dans le code de synchronisation**, et une formation venue d'Airtable qui les viole doit être rejetée et signalée, jamais écrite en silence. Sans cela, la validation des règles ne couvre que la retouche manuelle en console, c'est-à-dire le cas qui n'arrive jamais.

Synchronisation : une route serveur lit la table et met à jour la collection `formations`. Création des nouvelles, mise à jour des existantes par `airtableId`, passage à `actif: false` pour celles qui ont disparu. **Jamais de suppression**, pour ne pas casser les questions rattachées.

Déclenchement toutes les six heures, plus un bouton de synchronisation manuelle dans le back-office. Le résultat est mis en cache : ne pas appeler l'API à chaque chargement de page.

---

## 7. Écrans

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
