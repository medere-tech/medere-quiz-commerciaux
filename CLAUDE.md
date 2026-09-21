# CLAUDE.md

Application interne d'entraînement au catalogue de formations, pour les commerciaux de Médéré (organisme de formation médicale et dentaire, DPC).

Documentation de référence : `@README.md`

<!-- Volontairement court. La doc Claude Code recommande de rester sous 200 lignes : au-delà, l'adhésion baisse. Le détail va dans README.md et .claude/rules/. Dernière revue : 2026-09-01. -->

## Interlocuteurs

- **Déthié** — chef de projet, seul interlocuteur technique. Tutoiement, ton direct, pas de langue de bois.
- **Noémie** — responsable pédagogique, écrit les questions, anime la session du jeudi. Utilisatrice du back-office.
- **Les commerciaux** — une dizaine. Utilisateurs de l'entraînement.

## Pile

Next.js (App Router, TypeScript) sur Vercel · Firestore · Firebase Authentication (Google, domaine restreint) · Cloud Functions pour l'agrégation · Airtable en lecture seule pour le référentiel formations.

## Commandes

```bash
npm run dev            # développement local
npm run build          # compile l'application Next
npm run typecheck      # types de l'application ET de functions/
npm run lint
npm test
firebase emulators:start   # tester les règles de sécurité
firebase deploy --only firestore:rules
```

## Règles absolues

**Airtable est en lecture seule.** La base est pilotée par des automatisations en production. Aucune écriture, jamais. Si un besoin semble en exiger une, arrête-toi et signale-le à Déthié.

**Aucun secret côté navigateur.** Le jeton Airtable et les clés de service ne sortent pas du serveur. Tout passe par une route serveur.

**Les scores individuels sont privés.** Les réponses vivent sous `users/{uid}/reponses`. Personne d'autre que le propriétaire n'y accède, y compris les administrateurs. Les statistiques passent exclusivement par la collection agrégée `questionStats`, qui ne contient aucun identifiant d'utilisateur.

**Le rôle administrateur est un custom claim**, jamais un champ Firestore. Un champ `isAdmin` dans un document utilisateur est une faille, pas une autorisation.

**Ne jamais demander de secret dans la conversation.** Ni jeton de session, ni
cookie d'authentification, ni clé privée, ni jeton d'API. Un cookie de session
Médéré vaut quatorze jours d'accès complet, rôle administrateur compris, et ce
qui est collé dans une transcription y reste. Si une vérification en a besoin,
**la voie est un compte jetable et un secret qui ne quitte pas la machine** —
fabriqué par un script, écrit dans un fichier hors du dépôt, jamais affiché,
supprimé après. Et si aucune voie de ce genre n'existe, **on le dit et on se
passe de la mesure** : une mesure manquante se rattrape, un secret partagé non.

**Jusqu'à la mise en service, la base ne contient que de la recette.** Tout ce
qui s'y trouve sera effacé — `npm run recette:nettoyer` est écrit pour ça. **Aucune
décision de modèle ne doit être prise pour préserver ces données.** Si une bonne
pratique impose une migration, un champ obligatoire ou une rupture de
compatibilité, on l'applique : on repart propre. Ne pas proposer de rendre un
champ facultatif « pour ne pas casser l'existant » — l'existant est jetable.

**Ni `localStorage` ni `sessionStorage`.**

## Conventions

- Interface, contenu et messages d'erreur en **français**, en vouvoyant l'utilisateur.
- Code, noms de variables, commentaires et messages de commit en français également, pour rester cohérent avec le métier (`bonnesReponses`, pas `correctAnswers`).
- Une branche par lot, une PR par lot. Jamais de commit direct sur `main`.
- Avant tout commit : `npm run build && npm run typecheck && npm run lint && npm test`. Les quatre, pas seulement le premier — le build de Next ne compile plus `functions/`, qui est un paquet npm à part, avec ses propres dépendances, et que seul `npm run typecheck` vérifie.
- Les règles de sécurité Firestore sont versionnées et testées avec l'émulateur. Jamais de mode test.

## Interface

Le design est fourni par Claude Design. **Conforme-toi aux maquettes et à leurs tokens.** Ne substitue pas ta propre palette, ta propre typographie ou tes propres composants. Si un cas n'est pas couvert, signale-le plutôt que d'improviser.

Trois interdits fermes, valables partout :

- **Aucun emoji.** Un seul jeu d'icônes vectorielles, cohérent, tailles issues d'une échelle. Jamais un caractère typographique en guise d'icône.
- **Aucune bordure sur un seul côté.** Pas de filet vertical à gauche d'un bloc, pas de soulignement d'onglet actif, pas de trait sous chaque ligne de liste. On distingue par le fond, l'espacement ou une bordure complète.
- **Pas de surtitre en majuscules.** Aucun libellé en capitales posé au-dessus d'un titre ou en tête de section pour l'annoncer : le titre se suffit. Les badges de statut du système de design (`Etiquette`, `EtiquetteStatut`) sont hors de cette règle — leurs capitales sont voulues par les maquettes. Pas de flèche ajoutée au texte des boutons, pas de dégradé décoratif.

États vides, erreurs et chargements sont des écrans à part entière. Une erreur dit ce qui s'est passé et quoi faire, elle ne s'excuse pas.

**Une seule exception à `prefers-reduced-motion`, et elle est délibérée.** La
révélation du classement d'une séance collective
(`src/composants/session/RevelationClassement.tsx`) garde sa mise en scène même
quand le système demande à réduire les animations. Ailleurs — partout ailleurs —
la préférence est respectée sans discussion.

La raison : sur cet écran, **la mise en scène est la fonctionnalité**. Le rang
personnel seul, puis le podium qui se remplit par le bas, puis le prix qui
apparaît comme un objet : c'est ce déroulé qui fait qu'on revient le jeudi
suivant, pas le tableau qu'il produit. Le désarmer rendrait l'écran correct et
sans intérêt. La durée totale reste courte et rien n'y clignote.

**Ne « corrigez » pas cette exception.** Elle a été demandée explicitement, après
qu'une consigne inverse a été jugée mauvaise ici. Si elle doit tomber, c'est une
décision de produit, pas un alignement de règle.

## Ce qui est acquis en performance, et ne doit pas régresser

Ces points ont été gagnés en rattrapant six lots d'accumulation, mesure à
l'appui. Ils se défont en une ligne d'import mal placée. Les traiter comme les
tests : on ne livre pas en les cassant.

**Polices.** Du woff2 sous-ensemblé, chargé par `next/font/local`
(`src/styles/polices.ts`). Jamais un `.ttf` servi, jamais un `@font-face` écrit
à la main. Toute nouvelle face passe par `scripts/convertir-polices.py` —
déposer le `.ttf` dans `polices-source/`, l'ajouter à `FACES`, relancer, puis la
déclarer. Servir depuis `public/` ferait retomber les polices sous le
`Cache-Control: max-age=0, must-revalidate` de Vercel, soit un aller-retour par
police et par visite.

**Navigation.** Tout ce qui navigue est un `<Link>` — la primitive `Bouton`
accepte un `href` pour ça. Pas de `router.push` pour une navigation simple : il
ne précharge rien. Les listes cliquables, qui ne peuvent pas être des liens,
utilisent `useIntentionDeNavigation` ; les sorties connues d'avance,
`usePrechargementCertain`. **Toute nouvelle section a son `loading.tsx`** : sans
frontière de chargement, le clic reste figé le temps de l'aller-retour serveur —
mesuré à 425 ms contre 23 ms avec.

**Firestore n'est importé que par les modules qui s'en servent.** Ne jamais
remettre un `import` de `firebase/firestore` dans `src/lib/firebase/client.ts` :
ce module est le chemin d'accès à l'authentification, et l'écran de connexion
embarquerait de nouveau tout le SDK — 166 ko pour du code qu'il n'exécute pas.
`baseDeDonnees()` vit dans `src/lib/firebase/firestore.ts`, et nulle part
ailleurs.

**Cache.** Les ressources statiques sont `immutable` — c'est ce que donne
`/_next/static`, nom de fichier haché compris. Le HTML reste `no-store` : il
porte le prénom, l'avancement et le rôle. Ces deux règles ne se négocient pas
l'une contre l'autre.

**Aucune ressource lourde sur un écran qui ne s'en sert pas.** Avant d'ajouter
un import en tête d'un module partagé, se demander quel écran le tirera sans
l'employer.

**Ce qu'un écran ne peint pas, il ne doit pas le télécharger.** Masquer en CSS
ne coûte pas rien : un `display: none` sur une image la fait quand même
demander. Les quatre formes de fond de l'écran de jonction étaient chargées sur
téléphone pour n'être jamais visibles — même défaut que les polices servies
depuis `public/`. Quand une maquette ne dessine pas un élément à une largeur, le
retirer du **document**, pas seulement de l'œil.

**Une barre collante ne sort jamais de son conteneur.** `position: sticky` se
cale sur l'ancêtre qui défile, et **s'arrête au bord de son bloc conteneur** :
dès que ce bloc quitte l'écran, la barre part avec lui. Si l'élément doit tenir
face à la **fenêtre**, c'est `fixed`, pas `sticky` — avec une réserve de hauteur
sur la page, posée uniquement quand cette page porte la barre.

Le piège s'est présenté **trois fois**, et à chaque fois il ne se voyait qu'en
défilant, jamais à la lecture du CSS :

1. **Le panneau de composition** (lot 11) — les deux actions décrochaient de
   126 px en fin de défilement, parce que la réserve de bas de page valait pour
   tous les écrans mobiles alors que seuls certains portent un pied.
2. **Les commandes de la salle d'attente** (lot 10) — déclarées `sticky`, effet
   nul : `.salle-attente` porte `overflow: hidden` pour rogner un collage, et
   **un conteneur qui rogne est un conteneur de défilement**. Il ne défile
   jamais, donc rien ne colle.
3. **« Rejoindre » sur l'écran de jonction** — `sticky` au bas de la carte du
   formulaire, il quittait la fenêtre dès que la carte passait. C'est l'écran
   que dix commerciaux ouvrent chaque jeudi.

Corollaire : **un collant se vérifie en défilant, pas en lisant la règle qui le
déclare.** Mesurer sa position avant et après un défilement complet, à chaque
largeur de la maquette.

**`router.replace` est une navigation, `history.replaceState` n'en est pas
une.** Filtrer, trier, chercher ne sont pas des navigations : `router.replace`
change bien l'adresse, mais il fait aussi ce que fait toute navigation — **il
redemande au serveur la charge du segment**. Sur cet outil, cela veut dire le
rendu serveur de la page — donc la banque entière relue par le SDK Admin —,
puis un nouvel objet `referentiel` passé au composant client, donc les états et
la progression relus dans Firestore.
`window.history.replaceState` change l'adresse **sans** passer par le routeur :
aucune requête, aucun rendu serveur. **Mesuré** : un onglet de format passe de
six requêtes à zéro, un sélecteur de tri de quatre à zéro, trois frappes de
recherche de trois charges RSC à aucune.

**Mais l'adresse seule ne redessine pas l'écran, et la documentation de Next
l'annonce à tort.** Elle promet que `pushState` et `replaceState` tiennent
`usePathname` et `useSearchParams` à jour ; en 16.3.4, sur une page dynamique,
`useSearchParams` ne provoque aucun rendu. Mesuré : l'adresse passait à
`?format=vf`, l'onglet actif ne bougeait pas, la liste ne se filtrait plus — et
le choix suivant, reparti d'une adresse périmée, effaçait le précédent. La
valeur courante doit donc vivre dans un état React, semée depuis l'adresse, et
`replaceState` ne sert plus qu'à rendre la vue rechargeable et partageable. Voir
`useParametresUrl`.

**Ce que cela a coûté sans que personne le voie.** `useParametresUrl` porte
l'état des listes — filtre, tri, recherche, nombre de lignes chargées — sur
quatre écrans : la banque de questions, les formations, les statistiques et « À
revoir ». Chacun de ces gestes rejouait la chaîne complète, **depuis le lot où
ces onglets existent**. Rien ne clignotait, rien n'était faux à l'écran : le
même résultat arrivait, simplement payé deux fois.

La condition qui rend `replaceState` légitime tient en une ligne, et il faut la
vérifier avant de s'en servir : **aucune de ces pages ne lit `searchParams` côté
serveur.** Une page qui le ferait ne verrait pas le changement — c'est la seule
raison qui justifierait de revenir au routeur. `router.push` reste la bonne
primitive pour ce qui est vraiment une navigation, et `<Link>` pour tout ce qui
en est une visiblement.

Corollaire, et il rejoint celui du collant : **un aller-retour serveur ne se
lit pas dans le code, il se compte au réseau.** Ni la déclaration ni le rendu ne
disent qu'une requête part.

**Une requête ne s'arrête pas parce que son écran est parti.** Un drapeau
`vivant` dans un effet empêche d'**écrire** dans un composant démonté ; il
n'empêche pas les requêtes suivantes de **partir**. Une boucle qui en émet
soixante continue de les émettre après la navigation, et l'écran suivant attend
derrière la file.

**Mesuré au lot 17 :** l'écran des formations lance une agrégation par
formation visible. Atteindre les séances **depuis cet écran** prenait
**24 978 ms** ; sans y passer, **1 824 ms**. Treize fois, pour un écran dont
rien ne signalait qu'il était en cause.

La règle : **toute boucle qui émet des requêtes prend un `AbortSignal`**, et
l'effet qui la lance l'abandonne dans son ménage. Le SDK Firestore n'accepte
pas de signal sur ses lectures : ce qui est déjà parti ne s'annule pas — c'est
la seconde raison de borner le parallélisme, après le HTTP/2. Une vague en vol
au plus, jamais soixante.

Corollaire, qui vaut au-delà des requêtes : **ce qu'on mesure sur un écran ne
dit rien de ce qu'il coûte au suivant.** Les soixante agrégations avaient été
mesurées — cinq secondes, annoncées — et le vrai prix se payait ailleurs.

### La règle de méthode

À chaque lot qui touche au front, **avant livraison**, mesurer sur les écrans
touchés :

1. le **poids transféré** au premier chargement ;
2. le **délai entre le clic et le premier affichage**.

**Sur un écran authentifié, avec une banque réaliste, et en disant lequel.**
Deux lots de chiffres ont été annoncés sans cela : ils portaient sur l'écran de
connexion, et l'outil de mesure oubliait les ressources tierces et le document.
« 310,8 ko » en valait 903,9. Les écarts entre lots restaient justes, la valeur
absolue était fausse d'un facteur trois. Un poids qu'on ne peut pas rattacher à
un écran nommé et à un état de connexion nommé ne vaut rien.

**Et la leçon générale, qui dépasse la mesure : un chiffre cohérent avec
lui-même n'est pas un chiffre juste.** Les deux erreurs de ce harnais étaient
invisibles précisément parce qu'il se trompait de la même façon à chaque lot.
Une série de mesures qui évoluent proprement ne prouve rien sur ce qu'elles
mesurent. Vérifier ce qu'on compte, pas seulement que les comptes se suivent.

**Et le même motif, un cran plus loin : un faux qui rend ce qui arrange ne
prouve rien.** Un test double — `vi.mock`, une fausse dépendance, un faux
crochet — décide de ce que le monde répond. S'il répond ce qui rendrait le code
juste, le test passe et ne garde rien. Il ne se signalera jamais tout seul, pour
la même raison que le harnais ci-dessus : il se trompe identiquement à chaque
exécution.

**Constaté au 16.** Les tests d'écran faisaient rendre à `useSearchParams` une
adresse mise à jour après un `history.replaceState`. C'était commode, et c'était
faux : le vrai `useSearchParams` de Next 16.3.4 ne provoque aucun rendu dans ce
cas. Les tests passaient, **le filtre était cassé en silence sur quatre
écrans** — l'adresse changeait, l'écran ne bougeait pas, et le choix suivant,
reparti d'une adresse périmée, effaçait le précédent. Seul le navigateur l'a vu.

La règle qui en sort, et qui se vérifie en deux gestes :

1. **Un faux imite le comportement réel, pas le comportement souhaitable.**
   Quand on ignore ce que fait le vrai, on va le lire ou on le mesure — ici,
   quatre lignes dans `node_modules/next/dist/client/components/app-router.js`
   et une frappe dans un navigateur.
2. **Un test doit pouvoir tomber.** Avant de croire un test neuf, le faire
   échouer : remettre l'ancienne implémentation, casser la valeur attendue. Un
   test vert qui ne tombe sur rien ne garde rien.

Corollaire : **ce qui traverse une frontière qu'on a simulée n'est pas
vérifié.** Le faux dit ce qui s'écrit, jamais ce que l'autre côté en fait. Les
règles Firestore se testent donc sur l'émulateur, les écrans se recettent au
navigateur, et les deux restent dus même quand la suite est verte.

**Et le compilateur peut tenir cette règle à notre place : `vi.mock` prend
`import('…')`, pas une chaîne.**

```ts
vi.mock(import('@/lib/serie/depot'), async (original) => { … });
```

La forme à promesse type la fabrique en `Partial<typeof module>` : **un faux
qui promet moins, ou autre chose, que le vrai ne compile plus.** La forme à
chaîne ne vérifie rien. Le passage des deux formes a trouvé trois écarts que
l'audit à l'œil avait laissés — dont `crediterSerie` rendant `undefined` là où
le vrai rend la liste des récompenses gagnées, sur laquelle l'écran appelle
`.includes`.

Deux surfaces tierces ne s'y plient pas raisonnablement — `Auth` de Firebase,
le SDK `firebase/firestore`. **Les conversions de type vivent donc toutes dans
`tests/aide/faux.ts`, nommées, justifiées, et comptées** : il y en a deux, plus
un faux de module non typé. Une conversion dispersée dans chaque fichier se
multiplie sans que personne ne la recompte ; rassemblée, elle se corrige en un
endroit et se relit d'un coup d'œil.

Comparer au lot précédent. **Si l'un des deux se dégrade, le dire avec le
chiffre — même quand la dégradation est justifiée.** Une régression annoncée est
un arbitrage ; une régression tue se découvre six lots plus tard, et coûte une
journée à rattraper. C'est exactement ce qui vient d'arriver.

## Pièges connus

**Custom claims non rafraîchis.** Après attribution d'un rôle, la valeur n'apparaît dans les règles qu'au rafraîchissement du jeton, jusqu'à une heure plus tard. Prévoir `getIdToken(true)` ou une reconnexion.

**Quota Firestore partagé au niveau du projet.** Le quota gratuit ne couvre qu'une base par projet. Ne pas mutualiser avec un autre projet Médéré.

**Blaze n'a pas de plafond de dépense.** L'alerte budgétaire est un prérequis, pas une option.

**Session hybride.** Certains participants sont en visioconférence et voient l'écran partagé avec du retard. La question doit être poussée sur l'appareil de chaque participant via un écouteur temps réel, jamais dépendre de la projection.

**QCM à réponses multiples.** Une réponse n'est juste que si l'ensemble sélectionné correspond exactement à l'ensemble attendu. Une réponse partielle est fausse, et l'interface doit montrer ce qui manquait.

**Un `catch` qui rend une valeur normale efface la panne.** `lireSession` attrapait toute erreur de vérification du cookie et rendait `null` — « personne n'est connecté ». Un module introuvable prenait donc l'apparence exacte d'une session expirée : écran de connexion, aucun journal, deux déploiements perdus à chercher ailleurs. Même défaut au lot 6 sur la banque, où une liste périmée restait affichée sous un filtre en échec. Règle : un `catch` ne doit absorber que les causes qu'il sait nommer. Tout le reste remonte.

**Ce qui passe en local ne prouve pas ce qui passe au déploiement.** Deux fois déjà, un artefact vérifié d'un côté était utilisé de l'autre, sans que rien ne signale l'écart. Au lot 3, les règles publiées sur le projet Firebase étaient restées celles du mode production alors que le dépôt en portait trois cents lignes validées par l'émulateur : les tests portaient sur le fichier, pas sur le jeu déployé. Au lot 6, `functions/` compilait en local grâce à un `npm install` fait à la main dans ce dossier, et échouait sur Vercel qui n'installe que les dépendances de la racine. Toujours au lot 6, toutes les pages ont répondu 500 en production sur un `require()` de module ES refusé, au fond de la chaîne `firebase-admin` → `jwks-rsa` → `jose`, alors que le build passait et que le serveur local tournait. **Contre-exemple à garder en tête sur ce piège même : la première cause avancée — une version de Node trop ancienne — était fausse, et corriger `engines` n'a rien changé.** Le déploiement suivant a servi à le constater. La vraie cause, mesurée par une sonde dans `instrumentation.ts`, est que l'exécutant Vercel désactive `require(esm)` : `process.features.require_module` y vaut `false` sur Node 22.23. Reproduire vaut mieux que déduire, et un diagnostic qui n'a pas été reproduit reste une hypothèse — la mesure, elle, a tenu en un déploiement. À chaque fois, se demander : **ce que je viens de vérifier est-il bien ce qui sera exécuté ?** En cas de doute, reproduire les conditions du déploiement plutôt que les supposer — retirer les dépendances, relire le jeu de règles publié, mesurer sur le domaine réel, désactiver la fonctionnalité de Node dont on profite sans le savoir (`node --no-experimental-require-module`).

**Un message d'erreur peut être un préfixe fixe.** « User code failed to load.
Cannot determine backend specification. Timeout after 10000. » a désigné deux
causes opposées à deux jours d'intervalle : la première fois un vrai échec de
chargement — `jose` en module ES —, la seconde une simple lenteur, module
chargé en moins d'une seconde. La CLI écrit la même phrase dans les deux cas ;
**seule la présence de la sortie d'erreur du runtime les distingue**. Avant de
chercher dans le code, relancer la découverte seule et lire son journal. Et se
souvenir que `FUNCTIONS_DISCOVERY_TIMEOUT` existe : `npm run fonctions:deploy`
le pose déjà.

**Une sonde vaut mieux qu'une théorie, et elle se pose là où le code s'exécute encore.** La première sonde, placée dans un composant, n'a jamais imprimé : l'échec avait lieu au chargement du module. `register` de `instrumentation.ts` s'exécute une fois au démarrage, avant que le serveur accepte la moindre requête — c'est le point d'entrée à viser quand un import casse. Vérifier qu'une sonde est atteinte fait partie de la sonde.

**`engines.node` n'est pas une formalité.** C'est ce champ que Vercel lit pour choisir la version de Node qui exécutera l'application, et il l'emporte sur le réglage du projet. Le déclarer plus bas que ce que les dépendances exigent — `>=20.9.0` quand `firebase-admin` exige `>=22` — revient à annoncer un support qu'on n'a pas. Il vaut `22.x`, et `.npmrc` porte `engine-strict=true` pour que l'écart tombe à l'installation. **Cette correction répare une déclaration fausse, elle n'a pas réparé le 500 :** ne pas la lire comme telle.

## Méthode de travail

Livrer **un lot à la fois**, dans l'ordre défini au README, et s'arrêter à chaque palier pour validation par Déthié. Ne pas anticiper sur le lot suivant.

Avant de coder une intégration externe, vérifier la documentation officielle plutôt que se fier à une habitude. Les API changent.

Si une instruction d'ici contredit une demande en conversation, signaler la contradiction au lieu de choisir seul.

Ne jamais exécuter git commit, git push ou git merge. Les commits sont faits par Déthié. Prépare les fichiers, décris ce qui a changé, arrête-toi là.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
