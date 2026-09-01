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
npm run build          # vérifier avant tout commit
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
- `npm run build` doit passer avant tout commit.
- Les règles de sécurité Firestore sont versionnées et testées avec l'émulateur. Jamais de mode test.

## Interface

Le design est fourni par Claude Design. **Conforme-toi aux maquettes et à leurs tokens.** Ne substitue pas ta propre palette, ta propre typographie ou tes propres composants. Si un cas n'est pas couvert, signale-le plutôt que d'improviser.

Trois interdits fermes, valables partout :

- **Aucun emoji.** Un seul jeu d'icônes vectorielles, cohérent, tailles issues d'une échelle. Jamais un caractère typographique en guise d'icône.
- **Aucune bordure sur un seul côté.** Pas de filet vertical à gauche d'un bloc, pas de soulignement d'onglet actif, pas de trait sous chaque ligne de liste. On distingue par le fond, l'espacement ou une bordure complète.
- **Pas de libellés en majuscules**, pas de flèche ajoutée au texte des boutons, pas de dégradé décoratif.

États vides, erreurs et chargements sont des écrans à part entière. Une erreur dit ce qui s'est passé et quoi faire, elle ne s'excuse pas.

## Pièges connus

**Custom claims non rafraîchis.** Après attribution d'un rôle, la valeur n'apparaît dans les règles qu'au rafraîchissement du jeton, jusqu'à une heure plus tard. Prévoir `getIdToken(true)` ou une reconnexion.

**Quota Firestore partagé au niveau du projet.** Le quota gratuit ne couvre qu'une base par projet. Ne pas mutualiser avec un autre projet Médéré.

**Blaze n'a pas de plafond de dépense.** L'alerte budgétaire est un prérequis, pas une option.

**Session hybride.** Certains participants sont en visioconférence et voient l'écran partagé avec du retard. La question doit être poussée sur l'appareil de chaque participant via un écouteur temps réel, jamais dépendre de la projection.

**QCM à réponses multiples.** Une réponse n'est juste que si l'ensemble sélectionné correspond exactement à l'ensemble attendu. Une réponse partielle est fausse, et l'interface doit montrer ce qui manquait.

## Méthode de travail

Livrer **un lot à la fois**, dans l'ordre défini au README, et s'arrêter à chaque palier pour validation par Déthié. Ne pas anticiper sur le lot suivant.

Avant de coder une intégration externe, vérifier la documentation officielle plutôt que se fier à une habitude. Les API changent.

Si une instruction d'ici contredit une demande en conversation, signaler la contradiction au lieu de choisir seul.
