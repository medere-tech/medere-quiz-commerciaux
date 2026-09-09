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

## Pièges connus

**Custom claims non rafraîchis.** Après attribution d'un rôle, la valeur n'apparaît dans les règles qu'au rafraîchissement du jeton, jusqu'à une heure plus tard. Prévoir `getIdToken(true)` ou une reconnexion.

**Quota Firestore partagé au niveau du projet.** Le quota gratuit ne couvre qu'une base par projet. Ne pas mutualiser avec un autre projet Médéré.

**Blaze n'a pas de plafond de dépense.** L'alerte budgétaire est un prérequis, pas une option.

**Session hybride.** Certains participants sont en visioconférence et voient l'écran partagé avec du retard. La question doit être poussée sur l'appareil de chaque participant via un écouteur temps réel, jamais dépendre de la projection.

**QCM à réponses multiples.** Une réponse n'est juste que si l'ensemble sélectionné correspond exactement à l'ensemble attendu. Une réponse partielle est fausse, et l'interface doit montrer ce qui manquait.

**Un `catch` qui rend une valeur normale efface la panne.** `lireSession` attrapait toute erreur de vérification du cookie et rendait `null` — « personne n'est connecté ». Un module introuvable prenait donc l'apparence exacte d'une session expirée : écran de connexion, aucun journal, deux déploiements perdus à chercher ailleurs. Même défaut au lot 6 sur la banque, où une liste périmée restait affichée sous un filtre en échec. Règle : un `catch` ne doit absorber que les causes qu'il sait nommer. Tout le reste remonte.

**Ce qui passe en local ne prouve pas ce qui passe au déploiement.** Deux fois déjà, un artefact vérifié d'un côté était utilisé de l'autre, sans que rien ne signale l'écart. Au lot 3, les règles publiées sur le projet Firebase étaient restées celles du mode production alors que le dépôt en portait trois cents lignes validées par l'émulateur : les tests portaient sur le fichier, pas sur le jeu déployé. Au lot 6, `functions/` compilait en local grâce à un `npm install` fait à la main dans ce dossier, et échouait sur Vercel qui n'installe que les dépendances de la racine. Toujours au lot 6, toutes les pages ont répondu 500 en production sur un `require()` de module ES refusé, au fond de la chaîne `firebase-admin` → `jwks-rsa` → `jose`, alors que le build passait et que le serveur local tournait. **Contre-exemple à garder en tête sur ce piège même : la première cause avancée — une version de Node trop ancienne — était fausse, et corriger `engines` n'a rien changé.** Le déploiement suivant a servi à le constater. Reproduire vaut mieux que déduire, et un diagnostic qui n'a pas été reproduit reste une hypothèse. À chaque fois, se demander : **ce que je viens de vérifier est-il bien ce qui sera exécuté ?** En cas de doute, reproduire les conditions du déploiement plutôt que les supposer — retirer les dépendances, relire le jeu de règles publié, mesurer sur le domaine réel, désactiver la fonctionnalité de Node dont on profite sans le savoir (`node --no-experimental-require-module`).

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
