# Mise en service

La séquence à dérouler pour ouvrir l'outil aux commerciaux, dans l'ordre. Chaque
étape dit **quoi faire** et **quoi vérifier avant de passer à la suivante**. Si
une vérification ne donne pas le résultat attendu, on s'arrête là.

- Projet Firebase : `medere-quiz-commerciaux`.
- Branche à livrer : `lot-taux-depuis-etats`.
- Dernier commit de `main` avant ce lot : `7f87f38` (sert au retour arrière).

---

## Prérequis — à avoir une fois, avant le jour J

- **Firebase CLI connectée** au compte qui administre le projet :
  `firebase login:list` affiche ce compte. Sinon : `firebase login`.
- **GitHub CLI connectée** : `gh auth status` répond « Logged in ».
- **Vercel** : la production est déployée **automatiquement depuis `main`**.
  Vérifier une fois dans Vercel → Settings → Git que la branche de production
  est `main`. Si ce n'est pas le cas, l'étape 2 ne déploie rien.
- **Accès console** Google Cloud (IAM, comptes de service) et Vercel (Settings,
  Deployments, Logs) sur le bon projet.
- **Un navigateur de bureau** pour l'étape 5, avec les outils de développement
  (F12).

---

## 0. Avant de commencer

```
git status
npm run build && npm run typecheck && npm run lint && npm test
npm run test:fonctions
firebase use medere-quiz-commerciaux
firebase use
```

**Vérifier :**

- `git status` : branche `lot-taux-depuis-etats`, rien de non commité.
- `npm test` : tous les tests passent.
- `npm run test:fonctions` : tous les tests passent.
- `firebase use` affiche `medere-quiz-commerciaux`. Le dépôt n'a pas de
  `.firebaserc` : les scripts de déploiement visent le projet actif, d'où ce
  contrôle.

---

## 1. Nouvelle clé privée — sans supprimer l'ancienne

Console Google Cloud → IAM et administration → Comptes de service → le compte
dont l'adresse est `FIREBASE_ADMIN_CLIENT_EMAIL` → onglet **Clés** → **Ajouter
une clé** → **Créer une clé** → JSON. Un fichier `.json` se télécharge.

- Dans ce fichier, copier la valeur de `private_key` **telle quelle**, avec ses
  `\n` écrits en toutes lettres, comme l'est la clé actuelle.
- La coller dans `FIREBASE_ADMIN_PRIVATE_KEY`, dans `.env.local`.
- La coller dans Vercel : Settings → Environment Variables →
  `FIREBASE_ADMIN_PRIVATE_KEY`, environnement **Production**.
- `FIREBASE_ADMIN_CLIENT_EMAIL` ne change pas : c'est le même compte de service.
- **Noter l'identifiant de la nouvelle clé** (`private_key_id` dans le JSON, ou
  la colonne « ID de la clé » de la console) : il servira à l'étape 6 pour ne
  pas supprimer la mauvaise.
- **Supprimer le fichier `.json` téléchargé** une fois la valeur copiée, et
  fermer `.env.local` dans l'éditeur, aucune ligne sélectionnée — voir le
  README, section 3, « Rotation de la clé du compte de service ».
- **Ne pas supprimer l'ancienne clé maintenant** : la production tourne encore
  avec elle jusqu'au déploiement de l'étape 2.

**Vérifier** que la nouvelle clé fonctionne en local, en lecture seule :

```
npm run recette:nettoyer -- --table-rase
```

Attendu : la liste des collections et des comptes, puis
`ESSAI À BLANC — rien n'a été touché.` Une erreur d'authentification veut dire
que la clé est mal copiée : s'arrêter.

---

## 2. Fusion et déploiement Vercel

**Pourquoi l'application avant les règles.** Les nouvelles règles refusent
l'ancienne application, et l'ancienne application ne passe pas les nouvelles
règles : aucun ordre n'évite une fenêtre. Mais si les règles passaient en
premier, c'est la production en place qui casserait, sous les yeux de qui s'en
sert, au moment où la publication aboutit. L'application d'abord, c'est elle
qui est refusée, et le moment où la fenêtre se ferme est celui où l'on lance
l'étape 3.

```
git push -u origin lot-taux-depuis-etats
gh pr create --base main --head lot-taux-depuis-etats
```

Fusionner la PR (sur GitHub, ou `gh pr merge`). Vercel déploie `main` en
production, avec la nouvelle clé de l'étape 1.

**Vérifier :**

- Vercel → Deployments : le déploiement de production est **Ready**, et son
  commit est celui de la fusion.
- Le site répond, la connexion fonctionne, `/admin/statistiques` s'ouvre.

> **Entre la fin de cette étape et la fin de l'étape 3, la production tourne
> avec une application que les règles publiées refusent** : séries et votes
> échouent. C'est sans conséquence aujourd'hui, parce que personne n'utilise
> l'outil — ça ne le serait plus une fois les commerciaux en ligne : un
> déploiement de ce genre se ferait alors hors des heures d'usage, les deux
> étapes enchaînées sans pause.

Enchaîner directement sur l'étape 3.

---

## 3. Règles Firestore

```
npm run regles:deploy
```

La commande publie `firestore.rules`, puis relit le jeu publié et le compare au
fichier.

**Vérifier :** la sortie finit sur
`Les règles déployées sont exactement celles du dépôt.` Si elle dit
`Les règles déployées DIFFÈRENT de firestore.rules.`, ce qui tourne n'est pas
ce qui a été testé : s'arrêter.

---

## 4. Cloud Functions

```
npm run fonctions:deploy
```

La CLI annonce que `agregerReponseEntrainement` existe en production mais plus
dans le code, et demande s'il faut la supprimer : répondre **y**. Sans terminal
interactif : `npm run fonctions:deploy -- --force`.

**Vérifier :**

```
firebase functions:list
```

Exactement trois fonctions : `compterReponseSession`, `classerSessionTerminee`,
`publierPodiumRegularite`. Plus d'`agregerReponseEntrainement`.

---

## 5. Essai en production, avant la table rase

C'est le vrai chemin d'écriture sous les vraies règles : la seule preuve que
l'application et les règles publiées s'accordent. Les données qu'il écrit
partent à l'étape 7.

**Avant de commencer :**

1. Ouvrir le site dans un navigateur de bureau, **F12** → onglet **Console**,
   et le laisser ouvert pendant tout l'essai.
2. Dans Vercel → le projet → **Logs**, régler la période sur les quinze
   dernières minutes, et garder l'onglet à portée.

**L'essai :** avec un compte administrateur, jouer **une série jusqu'au bout**,
jusqu'à l'écran de fin.

**Conclure à un succès seulement si les trois sources le disent :**

| Où regarder | Succès | Échec |
|---|---|---|
| **L'écran** | Correction après chaque réponse, sans message rouge ; l'écran de fin annonce les étoiles. | « Cette réponse n'a pas pu être enregistrée… » pendant la série, ou « Vos étoiles n'ont pas pu être enregistrées. Vos réponses, si. » à la fin. |
| **La console du navigateur** | Aucune ligne rouge mentionnant Firestore. | `Réponse non enregistrée (permission-denied)`, `Série non créditée (permission-denied)`, ou une erreur `FirebaseError` / « Missing or insufficient permissions ». |
| **Les journaux Vercel** (Logs, recherche `Panne navigateur`) | Aucune ligne. | `Panne navigateur [ecriture] sur /serie (équipe pédagogique) : …` |

**Pourquoi trois sources et pas l'écran seul.** Un refus attrapé par un `catch`
peut disparaître de l'écran — c'est arrivé trois fois sur ce projet. Les deux
`catch` de la série et celui du vote de séance écrivent désormais le refus dans
la console **et** le versent au journal du serveur (origine `ecriture`) : un
refus que l'écran ne montrerait pas se voit quand même dans les deux autres.
Les journaux Vercel ne reçoivent que cinq pannes par chargement de page, sans
doublon : une seule ligne suffit à conclure.

**Si une seule des trois sources signale un refus : c'est un échec.**
S'arrêter, appliquer le retour arrière en fin de document, et me transmettre
la ligne de la console et celle du journal.

---

## 6. Supprimer l'ancienne clé

Console Google Cloud → même compte de service → **Clés**. Il y en a deux.
Supprimer celle dont l'identifiant **n'est pas** celui noté à l'étape 1.

**Vérifier :** recharger le site, se reconnecter, rouvrir
`/admin/statistiques` — tout répond.

---

## 7. Table rase

Essai à blanc d'abord :

```
npm run recette:nettoyer -- --table-rase
```

**Lire avant de confirmer :**

- Partent : `classements`, `questionStats`, **`questions`**, `sessions`,
  `synchronisations`, `users` — toutes les collections sauf une.
- Reste : `formations`, marquée **GARDÉE** (miroir d'Airtable, formation
  transverse comprise).
- Comptes Authentication gardés : exactement ceux de `ADMIN_EMAILS`. Leur
  document `users/` est recréé neuf — la série de l'étape 5 part avec.

**La banque de questions est vidée**, et c'est voulu : Noémie importe la sienne
sur une base propre, au lieu de la mêler aux questions de recette. La table
rase ne demande pas `--questions=toutes` : cette option ne concerne que le
nettoyage partiel.

Puis :

```
npm run recette:nettoyer -- --table-rase --confirmer=TABLE-RASE
```

Le script demande alors de **taper le nom du projet** :
`medere-quiz-commerciaux`, puis Entrée. Toute autre saisie annule sans rien
toucher.

**Vérifier :**

- Le script finit sur « Terminé. La base ne contient plus que les comptes
  administrateur et `formations`. »
- Relancer l'essai à blanc : il ne liste plus que `formations` (gardée) et les
  documents administrateur.
- La session reste valable : pas besoin de se reconnecter, et le rôle
  administrateur est intact (il vit dans Authentication, que la table rase
  garde).

---

## 8. Formation transverse

La table rase garde `formations` : « DPC et réglementation » n'a pas bougé.
Contrôle à blanc :

```
npm run formations:transverse
```

**Vérifier :** le script indique qu'elle existe. Seulement si elle manque :

```
npm run formations:transverse -- --faire
```

---

## 9. Avant d'ouvrir aux commerciaux

**Vérifier sur `/admin/statistiques` :** « Aucune question publiée », aucun
commercial dans le bloc « Maîtrise par commercial ».

Puis :

1. Noémie importe sa banque (`/admin/import`) et publie les questions.
2. Ouvrir l'accès aux commerciaux.

**Pas de stratégie TTL à poser.** Elle ne servait qu'aux marqueurs de
dédoublonnage de `questionStats`, qui n'existent plus, et elle n'avait jamais
été créée.

---

## Retour arrière, si l'étape 5 conclut à un échec

**Quand :** dès qu'une des trois sources de l'étape 5 signale un refus.

Les règles et l'application vont ensemble : on les ramène ensemble.

1. **Application** — Vercel → Deployments → le déploiement de production
   d'avant la fusion → menu « … » → **Promote to Production** (ou
   **Instant Rollback**).
   **Vérifier :** le déploiement en production est celui de `7f87f38`.
2. **Règles** — republier celles d'avant ce lot :

   ```
   git show 7f87f38:firestore.rules > firestore.rules
   npm run regles:deploy
   git checkout -- firestore.rules
   ```

   **Vérifier :** `regles:deploy` finit sur « Les règles déployées sont
   exactement celles du dépôt. » — le dépôt, à ce moment-là, contenant
   l'ancien fichier. Le `git checkout` final remet le fichier du lot.
3. **Fonctions** — à laisser en l'état pour un retour de quelques heures.
   L'ancienne application lit `questionStats`, qui ne s'incrémente plus : ses
   statistiques sont figées, rien ne casse. Pour un retour durable seulement :

   ```
   git checkout 7f87f38 -- functions/
   npm run fonctions:deploy
   git checkout -- functions/
   ```

**Vérifier après le retour :** refaire l'essai de l'étape 5 sur l'ancienne
version — une série passe, aucune des trois sources ne signale de refus.

Puis me transmettre la ligne de la console et celle du journal Vercel.

---

## Ce que coûte le nouveau jeu de règles

Les règles lisent désormais, par réponse, l'état et la réponse du même lot
(deux lectures), en plus de la question ; par crédit de série, la réponse qui le
justifie (une lecture). À dix commerciaux et une série de dix questions par
jour, c'est de l'ordre de 300 lectures de règle par jour, pour un quota gratuit
de 50 000.

---

## Fichiers liés

- `docs/formations-actives-sujets-proposes.csv` — les 163 formations actives
  d'Airtable au 1er octobre 2026, avec un sujet proposé, à vérifier, pour le
  regroupement par sujet.
- README, section 3, « Une source pour les taux » et « Ce qu'un client écrit,
  et ce qui le garantit ».
