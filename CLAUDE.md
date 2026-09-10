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

### La règle de méthode

À chaque lot qui touche au front, **avant livraison**, mesurer sur les écrans
touchés :

1. le **poids transféré** au premier chargement ;
2. le **délai entre le clic et le premier affichage**.

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
