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
  options : [{ id, texte }]
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

---

## 4. Règles de sécurité

À écrire explicitement et à tester avec l'émulateur. Jamais de mode test, même temporairement.

- `formations`, `questions` — lecture par tout utilisateur authentifié du domaine ; écriture réservée au custom claim administrateur.
- `users/{uid}` et `users/{uid}/reponses` — lecture et écriture par le propriétaire uniquement. **Aucune exception administrateur.**
- `questionStats` — lecture par l'administrateur ; écriture réservée aux Cloud Functions.
- `sessions` — lecture par tout utilisateur authentifié ; écriture réservée à l'animateur. Chaque participant n'écrit que sa propre réponse.
- Restriction de domaine vérifiée côté serveur, pas seulement dans l'interface.

Le custom claim est posé par une fonction d'administration à partir d'une liste d'adresses en variable d'environnement. Rappel du piège : la valeur n'apparaît dans les règles qu'au rafraîchissement du jeton.

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
