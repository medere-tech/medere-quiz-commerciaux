# Imports de design — table des matières

Le design est produit dans Claude Design, projet `6ed08356-56e4-4a06-ab31-037cb1ea59a1`, réparti sur cinq pages. Chaque page a son prompt d'import, à coller dans Claude Code **au moment où l'écran est construit**, jamais tous en même temps : un import charge le système de design complet et les écrans de la page, c'est du contexte à ne pas dépenser pour un lot qui ne les utilise pas.

Le prompt 1 (fondations) fait exception : il est importé au lot 3 et sert à tous les suivants.

## Règle de tri

**On implémente ce qui est tranché dans le code. Ce qui ne l'est pas attend.**

Claude Design a produit des écrans qui vont au-delà du périmètre décidé. Ce ne sont pas des erreurs — le brief décrivait les écrans, pas les décisions déjà prises. Mais un écran de maquette n'est pas une décision de produit. La colonne « statut » ci-dessous fait foi.

---

## Correspondance page → lot

| Page | Contenu | Lot |
|---|---|---|
| 1 · Fondations et composants | Direction visuelle, palette, typographie, échelles, composants, états | Lot 3 (et tous les suivants) |
| 4 · Back-office | Banque, import en masse, formations | Lots 3 et 4 |
| 2 · Entrer et s'entraîner (desktop) | Connexion, accueil, question, correction, fin de série, éditeur | Lot 5 |
| 5 · Mobile | Les mêmes écrans en mobile | Lots 5 et 9 |
| 6 · Salle d'attente de la séance | Ce que voit l'animatrice entre l'ouverture de la salle et la première question | Lot 10 |
| 7 · Préparer une séance | L'écran de travail de Noémie le mardi : composition, séances prêtes, historique | Lot 11 |
| 3 · Reprendre, approfondir, animer | À revoir, statistiques, formats VF et scénario, accès et session collective | Lots 5, 6, 7 et 9 |

---

## Tri écran par écran

### À implémenter — décidé dans le code

| Écran | Page | Lot |
|---|---|---|
| Direction visuelle, palette, typographie, échelles | 1 | 3 |
| Composants récurrents, option de réponse et verdict | 1 | 3 |
| Écrans vides, chargement, erreur | 1 | 3 |
| 06 · Banque de questions | 4 | 3 |
| 07 · Éditeur de question | 2 | 3 |
| 11 · Formations | 4 | 3 |
| 08 · Import en masse | 4 | 4 |
| 00 · Connexion | 2 | 5 |
| 01 · Accueil | 2, 5 | 5 |
| 02 · Question en cours | 2, 5 | 5 |
| 03 · Correction — moment signature | 2, 5 | 5 |
| 04 · Fin de série | 2, 5 | 5 |
| 05 · Questions à revoir | 3, 5 | 5 |
| Format · Vrai ou faux | 3 | 5 |
| Format · Mise en situation | 3 | 5 |
| 09 · Statistiques | 3 | 6 |
| 10c · Session collective, côté commercial | 3 | 7 |
| 10d · Session collective, côté animateur | 3 | 7 |
| 10a · Accès à la session | 3 | 9 |
| 10b · Accès · code refusé | 3 | 9 |
| 06 · Accès à la session (mobile) | 5 | 9 |
| 06b · Accès · code refusé (mobile) | 5 | 9 |
| Salle d'attente · projection, état vide, pause, arrêt | 6 | 10 |
| Salle d'attente · portable 1280, tablette 900, mobile 390 | 6 | 10 |
| Composer une séance · 1440, état initial, formation entière, sans chronomètre | 7 | 11 |
| Séances prêtes et passées · 1440 | 7 | 11 |
| Composer · 1024 · onglets | 7 | 11 |
| Séance passée · 1024 et 375 | 7 | 11 |
| Séances · 375 | 7 | 11 |

### Tranché au lot 7

| Écran | Ce qui a été décidé |
|---|---|
| **09 · Carte « Session du jeudi »** | **Construite au lot 7.** Le tri l'avait écartée parce qu'« un bouton vers un écran absent vaut moins que pas de bouton » : l'écran d'animation n'existait pas. Il existe, et la carte mène dessus. Elle annonce les questions les plus ratées, dans l'ordre où l'écran d'animation les prend. |
| **04b · Récompenses et équipe** | **Construit, au lot 7, sous une forme qui lève la contradiction relevée au tri.** L'objection tenait : un classement permanent entre commerciaux transforme un outil d'apprentissage en outil d'évaluation, et les scores d'entraînement restent privés. La séance collective est le seul contexte où le classement ne contredit rien — **ils étaient dans la même pièce et se sont vus répondre**. D'où la coupure : le **classement** est nominatif, il vit dans la séance et n'est lisible que par ceux qui y étaient, présence vérifiée par les règles ; le **prix** est privé, durable, et ne s'agrège à rien. Le tableau meurt avec la séance, le trophée reste. Rien ne remonte dans `questionStats`, et il n'existe nulle part de classement entre commerciaux hors d'une séance vécue ensemble. Chacun choisit le nom sous lequel il apparaît, borné à 32 caractères parce qu'il s'affiche sur un écran projeté. |

### Tranché au lot 9 — les écrans d'accès à la séance

Les quatre écrans d'accès (10a, 10b, 06, 06b) remplacent le formulaire de
jonction écrit au lot 7. **Ils ne sont pas une refonte cosmétique** : ils
annoncent ce que la séance couvre, combien de temps elle prendra, et qui est
déjà dans la salle. On n'entre plus à l'aveugle dans une pièce dont on ne sait
rien.

**La page 3 a été renumérotée par le design**, et le tableau ci-dessus suit :
les anciens 10a et 10b — la séance côté commercial et côté animatrice,
construits au lot 7 — sont devenus **10c et 10d**. 10a et 10b désignent
désormais l'accès et son erreur. Rien n'a changé dans ces deux écrans-là, seul
leur numéro.

#### Ce qui a été ajouté au modèle

La maquette montre quatre choses que le modèle ne portait pas. Les quatre ont
été créées.

| Champ | Pourquoi il ne pouvait pas être calculé |
|---|---|
| `titre` | Une séance n'avait pas de nom. Obligatoire, 60 caractères, saisi par Noémie à la composition. Le champ part rempli — « Séance du jeudi 17 septembre », depuis la date — parce qu'un titre vide s'afficherait en blanc sur un écran projeté. À la lecture, `titreDeSeance` retombe sur la date de création si le champ manque. |
| `description` | La phrase qui situe la séance (« les quatre questions les plus ratées du mois »). **Facultative** : le titre suffit, et un champ obligatoire qu'on ne sait pas remplir se remplit mal. 160 caractères. |
| `animateurNom` | « animée par Sophie Vasseur ». Impossible à lire ailleurs : `users/{uid}` est fermé à tout le monde sauf à son propriétaire, **sans exception administrateur**. L'animatrice publie donc son propre nom sur la séance — exactement le motif des marqueurs de présence, et pour la même raison. |
| `ouverteLe` | « Ouverte jeudi à 14 h 05 ». `creeeLe` ne pouvait pas servir : une séance composée le mardi et lancée le jeudi porte deux dates, et celle qui intéresse quelqu'un qui arrive est la seconde. Vaut `null` tant que la séance est en attente. |

**La durée n'est pas stockée, et ne doit jamais l'être.** Elle se calcule :
`questionIds.length × dureeQuestionSecondes × 2`, arrondi à cinq minutes,
annoncé « environ ». Une durée écrite en base mentirait dès que Noémie ajoute
une question ou change le chronomètre. Le facteur deux compte la révélation,
qui prend devant la salle autant de temps que la recherche de la réponse :
n'annoncer que le temps de vote sous-évaluerait la séance de moitié. **Un
chronomètre à zéro seconde ne donne pas « zéro minute »** — c'est « au rythme de
la parole », prévu par les règles : aucune durée n'est alors annoncée, seulement
le nombre de questions. Fonctions dans `src/lib/session/seance.ts`, testées dans
`tests/session/seance.test.ts`.

#### Ce que « Déjà dans la salle » a coûté aux règles

`sessions/{id}/participants` est **la seule collection nominative de l'outil**.
L'écran annonce les présents avant qu'on ait rejoint, ce qui exige `list` pour
quelqu'un qui n'est ni l'animatrice ni déjà présent. Un simple compteur n'aurait
rien économisé : une agrégation `count()` réclame exactement la même permission.

La règle est donc ouverte au domaine, **et conditionnée au statut de la
séance** :

```
allow list: if estAnimateur(sessionId)
  || (domaineAutorise()
      && get(.../sessions/$(sessionId)).data.statut in ['encours', 'pause']);
```

**C'est la clause de statut qui rend l'ouverture acceptable**, pas l'ouverture
qui est anodine. Sans elle, chaque séance passée deviendrait une archive
permanente de qui était là quel jeudi, lisible par tout le domaine — exactement
ce que la règle jumelle interdit sur la liste des réponses, et pour la même
raison. Pendant la séance, cette liste ne dit rien que la pièce ne voie, et que
l'écran projeté n'affiche déjà. Après, il n'en reste rien.

**Lire la salle ne fait entrer personne.** La barrière du classement est un
`exists()` sur son propre marqueur, pas une liste, et poser ce marqueur reste
réservé à son propriétaire sur une séance ouverte. Sept cas de règles couvrent
cette frontière, dont un explicitement : « avoir lu la salle ne donne pas accès
au classement ».

#### Les quatre écarts à la maquette, et leur raison

| Écart | Pourquoi |
|---|---|
| **La coquille de navigation est conservée** | La maquette dessine 10a sans coquille, avec son propre logo. Deux raisons de ne pas la suivre. D'abord, 10c — la séance elle-même — utilise `DesktopScreen`, donc *avec* coquille : en sortir l'écran d'accès obligerait à restructurer la route et changerait un écran validé au lot 7. Ensuite, un écran d'accès sans navigation enferme — qui se trompe de code n'aurait plus de retour vers l'accueil. Le logo de la maquette est omis : la coquille le porte déjà. |
| **« 10 invités » devient « N déjà là »** | Il n'existe aucune invitation dans l'outil : le code est dit à voix haute, et quiconque l'entend entre. Le seul compte de personnes qui soit vrai est celui des présents. Créer un mécanisme d'invitation pour honorer un chiffre de maquette aurait été une fonctionnalité entière, et elle contredirait le code annoncé oralement. |
| **La phrase d'accroche est calculée** | La maquette écrit « Huit questions, une dizaine de participants ». Les deux nombres sont réels ici, et suivent la séance. Quand la salle n'est pas encore lue, la phrase retombe sur « une dizaine de participants » plutôt que d'annoncer zéro. |
| **Un état « aucune séance ouverte » a été ajouté** | La maquette ne le dessine pas, et c'est pourtant l'état le plus fréquent : six jours sur sept, aucune séance ne tourne. Le formulaire reste utilisable — une séance en pause se rejoint avec son code — mais la colonne de droite dit la vérité au lieu d'afficher un programme vide. |

#### Ce qui a été redessiné au passage

`ChoixAvatar` suit maintenant la maquette : la teinte choisie porte **une coche**
au lieu de ses initiales, et l'anneau est double — un liseré de la couleur de la
carte, puis un cercle d'encre. C'est meilleur que le dessin précédent : huit
pastilles portant les mêmes deux lettres ne se distinguaient que par leur fond,
et l'anneau simple se perdait sur les teintes sombres.

Deux assets ont été ajoutés depuis le projet Claude Design :
`public/formes/forme-1-9F84BD.svg` (la forme 1 en violet, que le dépôt n'avait
pas) et `public/pictos/calendrier.svg`, premier pictogramme de marque du code.
Il vient avec un composant `Picto`, **distinct d'`Icone` et à ne pas mélanger
avec** : `Icone` est le jeu unique de l'interface, au trait, à l'échelle du
texte ; un picto est une illustration, réservée aux grands emplacements.

#### Ce que la recette navigateur a trouvé

Trois défauts, dont aucun n'était visible en test.

**1. Le jeu de règles déployé datait d'avant le lot.** Première écriture d'une
séance en conditions réelles : refusée. `hasOnly` rejetait `titre`,
`description`, `animateurNom` et `ouverteLe`, absents du jeu publié le
15 septembre. **C'est le piège du lot 3, à l'identique** — et c'est
`npm run regles:verifier`, écrit pour ça, qui l'a nommé en une commande :
« première différence, ligne 421 ». Règles republiées, écart revérifié à zéro.

*À noter pour la prochaine fois :* le `catch` de `ComposerSeance` avale la
cause sans la journaliser, si bien que l'écran disait « Séances indisponibles »
sans que la console montre quoi que ce soit. Le diagnostic est venu du script,
pas de l'application. C'est le défaut décrit dans `CLAUDE.md` — un `catch` qui
n'absorbe que ce qu'il sait nommer — et il reste à corriger là.

**2. L'heure s'affichait « 15:01 ».** `Intl.DateTimeFormat('fr-FR')` sépare
l'heure par deux points : c'est ce que dit CLDR, et c'est faux
typographiquement. En français l'heure se sépare par un « h », et la maquette
l'écrit d'ailleurs « Jeudi 14 h ». `ouvertureEnToutesLettres` compose désormais
à la main, avec des espaces insécables pour que « 15 h 01 » ne se coupe jamais
en fin de ligne. Deux tests le verrouillent, dont un qui interdit le motif
`\d:\d`.

**3. La mise à plat mobile de la carte ne s'appliquait pas.** À 375 px, le
formulaire devait se poser à même la page, comme la maquette 06 le dessine. La
règle CSS était juste et **sans effet** : la primitive `Carte` pose fond, ombre
et rembourrage en **style en ligne**, qu'une feuille de style ne peut reprendre
sans `!important`. Conséquence visible : la barre d'action collante s'arrêtait
à vingt pixels des bords au lieu de les atteindre. Corrigé avec `!important`,
qui est ici le motif déjà retenu par `.grille-deux-colonnes` et
`.entete-colonnes`. Mesuré après correction : la barre va de 0 au bord droit.

**Ce qui a été vérifié et tenait déjà** : la grille passe de `520px 336px` à
une colonne sous 900 px ; aucun débordement horizontal à 375, 414, 768, 900,
901, 1024, 1280 ni 1440 px ; les huit pastilles de couleur passent en grille de
quatre sur deux lignes et s'arrêtent à 324 px sur 375 ; l'aide clavier
disparaît sur téléphone ; la durée affichée suit le chronomètre en direct
(« environ 5 minutes » à 45 s, « environ 10 minutes » à 60 s, « au rythme de la
salle » sans chronomètre) ; la salle se peuple et se vide avec la séance, et
disparaît dès qu'elle est close.

**Une capture d'écran n'a pas pu être prise** : l'outil de capture du navigateur
échoue sur toutes les pages, y compris un SVG statique. La recette a donc porté
sur le DOM et les styles calculés, pas sur l'œil.

#### Ce qui n'a pas été fait, et devrait l'être

La liste des séances préparées, dans `ComposerSeance`, distingue toujours les
séances par leur nombre de questions et leur date — vérifié à la recette : elle
affiche « 4 questions · Code 5TB6NJ · 45 s par question », sans le titre.
**Maintenant qu'elles en ont un, c'est ce titre qui devrait s'y lire.** Hors
périmètre de ce lot, qui portait sur quatre écrans d'accès.

Le `catch` de `ComposerSeance` reste muet sur la cause d'un échec
d'enregistrement : c'est lui qui a masqué le refus des règles pendant la
recette. À reprendre en même temps.

### Ajouté hors maquette — la consigne du QCM multiple

**Ce qui a été ajouté**, le 15 septembre 2026 : une ligne de consigne au-dessus
des options, sur les trois écrans qui posent une question — la série
(`Serie.tsx`), la séance côté participant (`SessionParticipant.tsx`) et l'écran
projeté (`SceneProjetee.tsx`).

> Plusieurs réponses attendues — une réponse incomplète est comptée fausse.
>
> Une seule réponse.

Le groupe d'options porte désormais `role="group"`, un nom, et un
`aria-describedby` qui désigne cette consigne : elle est annoncée **une fois**
à l'entrée du groupe, pas répétée à chaque option. Composants
`ConsigneReponses` et `GroupeDeReponses`, dans `src/composants/ds/parcours.tsx`.

**Pourquoi hors maquette, et pourquoi quand même.**

Les maquettes distinguent « une réponse » de « plusieurs » par **la forme du
marqueur** : carré au lieu de rond. C'est une convention juste, et elle ne
suffit pas ici, pour trois raisons qui se cumulent :

1. **La règle est contre-intuitive et elle coûte des points.** Une sélection
   incomplète est comptée fausse — pas partiellement juste. C'est la règle la
   moins devinable de l'outil.
2. **Le public la découvre en situation.** Un commercial ouvre l'application un
   jeudi, sur son téléphone, entre deux appels. Il n'a aucune raison de
   connaître la convention carré/rond, et personne ne la lui expliquera.
3. **Pour un lecteur d'écran, l'information n'existait pas du tout.** La forme
   d'un marqueur n'est pas restituée, et le marqueur lui-même est
   `aria-hidden`.

La série l'annonçait déjà, à sa manière (« Plusieurs réponses attendues. N
cochées. ») ; la séance et l'écran projeté ne l'annonçaient pas. **Trois
formulations différentes pour une même règle auraient été pires que le
silence** : la consigne est désormais un seul composant, partagé.

**Ce qui a été ajouté à la formulation de la série** : la conséquence.
« Plusieurs réponses attendues » se lit comme une invitation ; « une réponse
incomplète est comptée fausse » se lit comme une règle. C'est la seconde qui
change ce qu'on clique.

**Trouvé par un test d'écran**, écrit depuis la règle du modèle et non depuis
l'écran : il a échoué en ayant raison. Voir
`tests/ecrans/session-participant.test.tsx`.

**L'étiquette de type suit, et elle aussi sort de la maquette.** Elle affichait
`LIBELLES_TYPE`, donc « Choix multiples » pour **tout** QCM — y compris ceux
qui n'ont qu'une bonne réponse. Le terme est techniquement juste : un
questionnaire à choix multiple propose plusieurs options, il n'en attend pas
plusieurs. Mais personne ne le lit ainsi, et une fois la consigne ajoutée,
l'écran pouvait afficher « CHOIX MULTIPLES » trois lignes au-dessus de « Une
seule réponse. » **L'étiquette créait l'ambiguïté que la phrase venait de
lever.**

Sur les trois écrans qui posent une question, elle dit désormais le **nombre de
réponses attendues** : « Une réponse », « Plusieurs réponses », et « Vrai ou
faux » inchangé — celui-là nomme les deux options elles-mêmes et ne peut pas se
lire comme « plusieurs réponses ». « Mise en situation » disparaît de ces
écrans : le contexte est affiché en toutes lettres juste au-dessus de l'énoncé,
et une mise en situation portait exactement la même ambiguïté qu'un QCM.

**Les listes et l'éditeur gardent `LIBELLES_TYPE`**, qui y est le bon nom — et
d'ailleurs le seul possible, puisqu'une question de liste ne porte pas ses
bonnes réponses. Fonction `libelleAttendu`, dans `src/lib/questions/modele.ts`.

### Corrigé hors maquette — les titres des états vides et des erreurs

`EtatVide` et `EtatErreur` rendaient leur intitulé dans un `<span>`.
Visuellement c'était juste — taille et graisse d'un titre — mais un lecteur
d'écran qui navigue de titre en titre ne s'y arrêtait jamais, et ce sont
précisément les écrans où l'on cherche à comprendre ce qui se passe.

Passés en `<h2>`, le 16 septembre 2026, avec `margin: 0` pour annuler la marge
par défaut. **Rien ne change à l'affichage**, vérifié à la capture. `h2` et non
`h1` : ces blocs vivent dans une page qui a déjà son titre ; quand ils occupent
l'écran entier, ce sont les écrans de limite qui prennent le relais, avec un
`h1`.

Ce n'est pas une amélioration, c'est un défaut d'accessibilité corrigé.

### Retiré faute de maquette

| Élément | Ce qui a été fait | Pourquoi |
|---|---|---|
| **Entrée « Catalogue » de la barre du parcours** | retirée le 10 septembre 2026 | **Elle ne correspond à aucun écran de maquette.** Le relevé page par page n'en trouve aucun côté commercial ; le plus proche est *06b · Détail d'une formation*, lui-même en attente, et un détail suppose une liste qui n'est dessinée nulle part. Cette entrée avait été inventée : elle ne menait pas à un écran en attente, elle ne menait à aucune décision. Si un catalogue consultable par les commerciaux est voulu, c'est une demande à faire au design, pas une case à décocher ici. |

### En attente — non tranché

| Écran | Page | Pourquoi |
|---|---|---|
| **06b · Une question et ses résultats, par commercial** | 4 | **Contredit la confidentialité des scores.** Les réponses vivent sous `users/{uid}/reponses`, sans exception administrateur ; `questionStats` ne porte aucun identifiant. 24 tests garantissent que personne ne peut voir qui a raté quoi. Cet écran est infaisable par construction, et c'est voulu. À reprendre sans nominatif — répartition, taux d'échec, évolution — ce que `questionStats` permet déjà. Ouvrir le nominatif serait une décision managériale, pas un ajustement technique. |
| **00 · Rappel du jour (notification)** | 5 | Fonctionnalité absente de la demande de Noémie et de tous les lots. Chantier propre : notifications web avec permissions navigateur, ou e-mail, plus une planification serveur. Répond au vrai risque du projet — l'outil qu'on ouvre trois semaines puis plus jamais — donc à considérer, mais comme un lot en soi. |
| **01b · Choisir sa série** | 2 | Sélection manuelle par formation, format ou priorité. Le modèle prévoit un tirage pondéré automatique (jamais vue 3, ratée 6, réussie 1,2, réussie deux fois 0,4). Un choix manuel permet d'éviter les formations mal maîtrisées, ce que la pondération cherche justement à empêcher. À arbitrer : les deux peuvent coexister, mais il faut le décider. **L'entrée « Séries » de la barre latérale du parcours a été retirée** le 10 septembre 2026 : l'arbitrage n'est pas pris, et une entrée grisée qui n'attend aucune date est un défaut de navigation, pas une annonce. À remettre dans `src/app/(parcours)/layout.tsx` si la sélection manuelle est tranchée. |

| **09 · Bloc « Maîtrise par commercial »** | 3 | **Contredit la confidentialité des scores.** Sur l'écran 09, un encadré liste six commerciaux et leur pourcentage de maîtrise, et chaque ligne renvoie vers 06b. Calculer ces pourcentages exige de lire `users/{uid}` et ses réponses, que les règles ferment à l'administrateur sans exception ; `questionStats` ne porte aucun identifiant. Infaisable par construction, et voulu. **Construit à sa place :** la fragilité par formation, taux d'échec cumulé et anonyme — la même question posée à l'échelle du catalogue. Ouvrir le nominatif serait une décision managériale, pas un ajustement technique. |
| **11 · Chiffre « % maîtrise équipe » sur chaque carte de formation** | 4 | **Contredit la confidentialité des scores, et c'est la troisième fois — même famille que les deux blocs ci-dessus.** La maquette pose deux chiffres sur chaque carte : « 24 questions » et « 92 % maîtrise équipe ». Le premier se compte. Le second est une moyenne des maîtrises individuelles : il demanderait de lire `users/{uid}` et ses réponses pour chaque commercial, que les règles ferment à l'administrateur **sans exception**, et `questionStats` ne porte aucun identifiant — il ne sait pas non plus de quelle formation relève un échec sans recouper avec la banque, mais c'est un détail : même agrégé, le chiffre viendrait de données fermées. Infaisable par construction, et voulu. **Construit à sa place :** le nombre de questions servies et le nombre de brouillons — le chiffre sur lequel Noémie peut agir, là où un taux d'équipe ne se regarde pas sans se comparer. Ouvrir le nominatif serait une décision managériale, pas un ajustement technique. |
| **09 · Onglets de période (7 jours / 30 jours)** | 3 | `questionStats` est un cumul depuis la mise en service : deux compteurs et une date de dernière écriture, sans découpage dans le temps. Afficher « 7 jours » rendrait le total présent sous une étiquette fausse. Les construire suppose que la Cloud Function écrive aussi des compteurs par période — décision de modèle, à prendre avant d'être codée. |
| **06b · Détail d'une formation** | 3 | Programme, argumentaires, points faibles. Aucun de ces contenus n'existe dans le modèle : on stocke nom, cibles, format, modalité, durée, URL. Programme et argumentaires vivent dans les fiches PDF de Noémie, hors Airtable. « Points faibles » est calculable depuis `questionStats` si ça désigne les questions les plus ratées — à définir. |

---

## Les prompts

### Prompt 1 — Fondations et composants
*Lot 3. À importer en premier, sert à tous les lots suivants.*

```
Use the claude_design MCP (https://api.anthropic.com/v1/design/mcp, auth via /design-login) to import this project:
https://claude.ai/design/p/6ed08356-56e4-4a06-ab31-037cb1ea59a1?file=M%C3%A9d%C3%A9r%C3%A9+Entra%C3%AEnement+1+-+fondations+et+composants.html
Focus on these files (the whole project is readable):
- `Médéré Entraînement 1 - fondations et composants.html`
Also read these files the selection imports:
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/_ds_bundle.js`
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/styles.css`
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/base.css`
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/colors.css`
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/elevation.css`
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/fonts.css`
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/motion.css`
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/radius.css`
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/spacing.css`
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/typography.css`
- `foundations.jsx`
- `screens-admin.jsx`
- `ui.jsx`
Implement: `Médéré Entraînement 1 - fondations et composants.html`
```

Contient : direction visuelle · palette, rôles et contrastes · typographie Aileron + DM Serif Text · échelles d'espacement, rayons, élévation, mouvement, icônes · composants récurrents · option de réponse et verdict · écrans vides, chargement, erreur.

### Prompt 4 — Back-office
*Lots 3 et 4.*

```
Use the claude_design MCP (https://api.anthropic.com/v1/design/mcp, auth via /design-login) to import this project:
https://claude.ai/design/p/6ed08356-56e4-4a06-ab31-037cb1ea59a1?file=M%C3%A9d%C3%A9r%C3%A9+Entra%C3%AEnement+4+-+back-office.html
Focus on these files (the whole project is readable):
- `Médéré Entraînement 4 - back-office.html`
Also read these files the selection imports:
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/_ds_bundle.js`
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/styles.css`
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/base.css`
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/colors.css`
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/elevation.css`
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/fonts.css`
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/motion.css`
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/radius.css`
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/spacing.css`
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/typography.css`
- `screens-admin.jsx`
- `screens-extra.jsx`
- `ui.jsx`
Implement: `Médéré Entraînement 4 - back-office.html`
```

Contient : 06 · Banque de questions · **06b · Une question et ses résultats, par commercial (EN ATTENTE)** · 08 · Import en masse · 11 · Formations.

### Prompt 2 — Entrer et s'entraîner (desktop)
*Lot 5. Contient aussi l'éditeur, utile au lot 3.*

```
Use the claude_design MCP (https://api.anthropic.com/v1/design/mcp, auth via /design-login) to import this project:
https://claude.ai/design/p/6ed08356-56e4-4a06-ab31-037cb1ea59a1?file=M%C3%A9d%C3%A9r%C3%A9+Entra%C3%AEnement+2+-+entrer+et+s%27entra%C3%AEner.html
Focus on these files (the whole project is readable):
- `Médéré Entraînement 2 - entrer et s'entraîner.html`
Also read these files the selection imports:
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/_ds_bundle.js`
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/styles.css`
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/base.css`
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/colors.css`
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/elevation.css`
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/fonts.css`
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/motion.css`
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/radius.css`
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/spacing.css`
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/typography.css`
- `screens-admin.jsx`
- `screens-extra.jsx`
- `screens-sales.jsx`
- `ui.jsx`
Implement: `Médéré Entraînement 2 - entrer et s'entraîner.html`
```

Contient : 00 · Connexion · 01 · Accueil · **01b · Choisir sa série (EN ATTENTE)** · 02 · Question en cours · 03 · Correction · 07 · Éditeur de question · 04 · Fin de série · **04b · Récompenses et équipe (EN ATTENTE)**.

### Prompt 5 — Mobile
*Lot 5, en même temps que le prompt 2.*

```
Use the claude_design MCP (https://api.anthropic.com/v1/design/mcp, auth via /design-login) to import this project:
https://claude.ai/design/p/6ed08356-56e4-4a06-ab31-037cb1ea59a1?file=M%C3%A9d%C3%A9r%C3%A9+Entra%C3%AEnement+5+-+mobile.html

Focus on these files (the whole project is readable):
- Médéré Entraînement 5 - mobile.html

Also read these files the selection imports:
- _ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/_ds_bundle.js
- _ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/styles.css
- _ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/base.css
- _ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/colors.css
- _ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/elevation.css
- _ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/fonts.css
- _ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/motion.css
- _ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/radius.css
- _ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/spacing.css
- _ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/typography.css
- screens-admin.jsx
- screens-join.jsx
- screens-mobile.jsx
- ui.jsx

Implement: Médéré Entraînement 5 - mobile.html
```

Contient : **00 · Rappel du jour (EN ATTENTE)** · 01 · Accueil · 02 · Question, choix multiples · 03 · Correction · 04 · Fin de série · 05 · À revoir · 06 · Accès à la session · 06b · Accès · code refusé.

### Prompt 6 — Salle d'attente de la séance
*Lot 10.*

```
Use the claude_design MCP (https://api.anthropic.com/v1/design/mcp, auth via /design-login) to import this project:
https://claude.ai/design/p/6ed08356-56e4-4a06-ab31-037cb1ea59a1?file=M%C3%A9d%C3%A9r%C3%A9+Entra%C3%AEnement+6+-+salle+d%27attente+de+la+s%C3%A9ance.html
Focus on these files (the whole project is readable):
- `Médéré Entraînement 6 - salle d'attente de la séance.html`
Also read these files the selection imports:
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/_ds_bundle.js`
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/styles.css`
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/base.css`
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/colors.css`
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/elevation.css`
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/fonts.css`
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/motion.css`
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/radius.css`
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/spacing.css`
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/typography.css`
- `screens-admin.jsx`
- `screens-join.jsx`
- `screens-lobby.jsx`
- `ui.jsx`
Implement: `Médéré Entraînement 6 - salle d'attente de la séance.html`
```

Contient : salle d'attente en projection 1920 · état vide · séance en pause · arrêter la séance et ses deux issues · portable 1280 · tablette 900 · mobile 390.

### Prompt 7 — Préparer une séance
*Lot 11.*

```
Use the claude_design MCP (https://api.anthropic.com/v1/design/mcp, auth via /design-login) to import this project:
https://claude.ai/design/p/6ed08356-56e4-4a06-ab31-037cb1ea59a1?file=M%C3%A9d%C3%A9r%C3%A9+Entra%C3%AEnement+7+-+pr%C3%A9parer+une+s%C3%A9ance.html
Focus on these files (the whole project is readable):
- `Médéré Entraînement 7 - préparer une séance.html`
Also read these files the selection imports:
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/_ds_bundle.js`
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/styles.css`
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/base.css`
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/colors.css`
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/elevation.css`
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/fonts.css`
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/motion.css`
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/radius.css`
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/spacing.css`
- `_ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/typography.css`
- `screens-admin.jsx`
- `screens-compose.jsx`
- `ui.jsx`
Implement: `Médéré Entraînement 7 - préparer une séance.html`
```

Contient : composer une séance · état initial · formation entière d'un geste · sans chronomètre · séances prêtes et passées · composer 1024 · séance passée 1024 · séances 375 · séance passée 375.

### Prompt 3 — Reprendre, approfondir, animer
*Lots 5, 6 et 7. À importer au lot 5, puis relire aux lots 6 et 7.*

```
Use the claude_design MCP (https://api.anthropic.com/v1/design/mcp, auth via /design-login) to import this project:
https://claude.ai/design/p/6ed08356-56e4-4a06-ab31-037cb1ea59a1?file=M%C3%A9d%C3%A9r%C3%A9+Entra%C3%AEnement+3+-+reprendre%2C+approfondir%2C+animer.html

Focus on these files (the whole project is readable):
- Médéré Entraînement 3 - reprendre, approfondir, animer.html

Also read these files the selection imports:
- _ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/_ds_bundle.js
- _ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/styles.css
- _ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/base.css
- _ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/colors.css
- _ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/elevation.css
- _ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/fonts.css
- _ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/motion.css
- _ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/radius.css
- _ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/spacing.css
- _ds/medere-design-system-94f9eab4-e181-4249-9ba0-5ae949bf8123/tokens/typography.css
- screens-admin.jsx
- screens-extra.jsx
- screens-join.jsx
- screens-mobile.jsx
- screens-sales.jsx
- ui.jsx

Implement: Médéré Entraînement 3 - reprendre, approfondir, animer.html
```

Contient : 05 · Questions à revoir · 09 · Statistiques · Format · Vrai ou faux · Format · Mise en situation · **06b · Détail d'une formation (EN ATTENTE)** · 10a · Accès à la session · 10b · Accès · code refusé · 10c · Session collective, côté commercial · 10d · Session collective, côté animateur.

---

## Ce que le lot 10 a construit — la salle d'attente

**L'écran qui manquait entre deux gestes qu'on croyait n'en faire qu'un.**
Jusqu'ici, « Lancer » posait la question 1 devant une salle vide pendant que
Noémie dictait le code. Ce sont deux moments distincts, et celui du milieu dure
deux minutes : dicter, attendre les retardataires, voir les noms arriver.

### Trois moments, là où le statut n'en distinguait que deux

Le modèle savait dire « composée » (`attente`) et « en cours » (`encours`). Il
ne savait pas dire « la salle est ouverte, on attend le monde », qui est
précisément l'écran de la page 6. D'où **`demarree`**, un booléen :

| Statut | `demarree` | Ce que c'est |
|---|---|---|
| `attente` | faux | Composée, pas ouverte. Le code ne vaut rien, personne ne rejoint. |
| `encours` | **faux** | **La salle est ouverte. C'est la salle d'attente.** |
| `encours` | vrai | La première question est posée. C'est l'écran 10d. |

`lancerSeance()` ouvre la salle ; **`demarrer()`**, nouveau, pousse la première
question et repose le chronomètre. Sans cette séparation, la question 1
arrivait avec un décompte déjà entamé du temps qu'il avait fallu pour remplir
la pièce.

**Conséquence côté participant**, hors maquette et nécessaire : quelqu'un qui
rejoint pendant l'attente voyait la question 1 avant qu'elle soit posée, et
pouvait y répondre pendant que Noémie parlait encore. `SessionParticipant`
affiche désormais « Vous êtes dans la salle » tant que `demarree` est faux.

### Ce qui a été ajouté au modèle

| Champ | Pourquoi il ne pouvait pas être calculé |
|---|---|
| `demarree` | Voir ci-dessus. Booléen, obligatoire. |
| `effectifAttendu` | Le dénominateur de « 8 sur 10 ». L'outil n'a pas de liste d'invités — le code est dit à voix haute, quiconque l'entend entre. Noémie le déclare à la composition. **Zéro vaut « non déclaré »** : l'écran affiche alors le seul nombre de présents, jamais un dénominateur inventé. |
| `participants.presence` | « en salle » / « en visio ». La séance est hybride, et l'animatrice mène différemment selon qui est devant elle. Déclaré par son porteur, comme le nom et la couleur — jamais pour quelqu'un d'autre. |
| `users.presence` | Le dernier lieu déclaré, proposé d'emblée la fois suivante. Facultatif côté règles. |

### La route `/rejoindre`

L'écran projeté dicte une adresse. **Elle et le chemin réel viennent de la même
constante** (`src/lib/session/rejoindre.ts`) : un mur qui dicterait une adresse
morte ferait rater la séance à toute la salle, et rien dans un test ne l'aurait
signalé. `/rejoindre` redirige vers `/session` — une seule route rend le
formulaire, donc un seul écran à tenir.

Pourquoi pas `/session` directement : « rejoindre » se recopie sans hésiter,
« session » se confond avec « cession » quand on l'entend.

### Les quatre écarts à la maquette

| Écart | Pourquoi |
|---|---|
| **« Les réponses sont effacées » n'est pas écrit** | Écart **assumé et tranché** — voir ci-dessous. |
| **Un bouton « Mettre en pause » a été ajouté** | La maquette dessine l'état « séance en pause » de la salle d'attente, mais aucun bouton n'y mène : les deux commandes dessinées sont « Lancer » et « Arrêter ». Une fois la séance démarrée, la pause mène à l'écran 10d, pas ici. L'état était donc inatteignable. Le bouton le rend réel — suspendre une salle qui se remplit est un geste légitime, et il cesse d'annoncer la séance sur l'écran d'accès. |
| **L'étiquette du code, en pause, dit « Le code reste valable »** | La maquette y écrit « Séance en pause ». Mais l'état est déjà annoncé deux fois — la pastille du bandeau, le miroir juste en dessous — et un test d'écran a buté sur cette redondance. Cette ligne peut porter la seule information que personne ne devine : les règles acceptent une arrivée pendant une pause, un retardataire peut encore entrer. |
| **Le miroir montre le vrai titre, pas « Reprise imminente »** | La maquette écrit « Reprise imminente » dans la vignette « vu par la salle ». L'écran du participant, lui, affiche « Séance en pause ». **Un miroir qui montre autre chose que la réalité est pire que pas de miroir** : l'animatrice croirait savoir. Les deux écrans partagent désormais la constante `TITRE_PAUSE_PARTICIPANT`, et le test la vérifie depuis la constante — pas depuis le texte recopié, qui passerait encore le jour où la formulation change. |

#### L'abandon n'efface pas les réponses — **révisé au lot 11**

> **Cette section décrit la décision du lot 10, qui a été affinée au lot 11.**
> Les réponses *de la séance* sont désormais effacées à l'abandon ; la
> progression de chacun, elle, ne bouge toujours pas. Voir « L'abandon efface
> les réponses de la séance », plus bas. Le raisonnement ci-dessous reste vrai
> pour la seconde moitié, qui est celle qui compte pour les commerciaux.

#### Ce qui avait été tranché au lot 10

**La maquette de la page 6 annonce, sur l'issue « Abandonner sans classement » :
« Les réponses sont effacées, aucun score n'est enregistré. » Le code ne fait
pas cela, et il ne le fera pas.**

`abandonner()` ne touche à aucune réponse. Elle passe la séance à `abandonnee`,
et c'est tout : rien n'est classé, aucun prix n'est attribué, mais les réponses
déjà données restent dans la progression de chacun et dans les questions à
revoir, comme n'importe quelle réponse d'entraînement.

**La raison, tranchée au lot 7 et confirmée au lot 10 :** on abandonne une
séance quand le résultat collectif ne voudrait rien dire — la visioconférence
tombe, une question se révèle inutilisable, la moitié de la salle est partie.
Rien de tout cela n'est la faute de ceux qui avaient répondu. **Effacer leurs
réponses les punirait d'avoir participé à une séance qui a mal tourné**, et
leur ferait perdre des questions correctement traitées. La séance collective
échoue ; l'entraînement individuel, lui, a bien eu lieu.

C'est aussi ce que l'écran du participant promet depuis le lot 7 : « Vos
réponses comptent quand même dans votre progression et dans vos questions à
revoir. » Deux écrans qui se contrediraient sur le sort de données déjà écrites
seraient pires qu'un seul écran imprécis.

**C'est donc la maquette qui est à corriger, pas le code.** Le libellé exact du
dialogue est verrouillé par un test d'écran, qui vérifie à la fois la présence
de « restent dans la progression de chacun » et **l'absence** du mot
« effacées » : un retour en arrière échoue avant d'atteindre la salle.

### Les quatre densités

La maquette décline l'écran à 1920, 1280, 900 et 390 px avec quatre jeux de
tailles. Ils vivent en **variables CSS** sur `.salle-attente`, redéfinies à
trois points de rupture (700, 1100, 1600 px) : ce qui change entre les
largeurs est d'abord une échelle, et seulement ensuite une disposition. Deux
colonnes au-delà de 1100 px, une seule en dessous.

**Le code suit exactement la maquette** : 208 / 142 / 116 / 58 px, mesuré au
navigateur aux quatre largeurs. Il est en Aileron 600 très espacé, et non dans
le serif de la marque : à deux cents pixels et à plusieurs mètres, ce qui
compte est qu'un 8 ne se lise pas 6.

**Rien d'important sous 18 px**, à aucune largeur — `--sa-meta-l`, `--sa-sub`,
`--sa-label` et `--sa-btn` ne descendent jamais plus bas.

### Ce que la recette navigateur a vérifié

**1. L'écouteur tient sur une salle qui se remplit.** Huit participants écrits
un par un à 1,5 s d'intervalle, pendant que l'écran projeté tournait. Résultat
mesuré : progression strictement croissante 0 → 1 → … → 8, aucun retour en
arrière ; **neuf mutations DOM pour huit arrivées**, soit une par personne et
aucun rebond ; hauteur du panneau constante à deux valeurs près (805 puis
836 px), la liste grandissant dans un panneau de hauteur fixe. Les décalages de
mise en page pendant le remplissage valent **10⁻⁵** — trois arrivées sur huit en
produisent un, les cinq autres aucun. Le cumul de 0,043 relevé sur la page
entière appartient à l'hydratation initiale, mesurée avant que la salle ne
commence à se remplir.

**2. L'animatrice lit bien sa salle avant le lancement.** La règle `list` sur
`participants` n'ouvre au domaine que pendant `encours` et `pause` ; la
première branche, `estAnimateur()`, ne regarde pas le statut. Vérifié à
l'émulateur plutôt que déduit : deux tests, l'un qui confirme que l'animatrice
lit une séance `attente`, l'autre qu'un commercial ne le peut pas.

**3. Le code reste lisible du fond de la salle.** Mesuré aux quatre largeurs ;
il tient dans sa carte sans déborder (1108 px de large à 1920) et `overflow-wrap`
le protège d'un code inhabituellement long.

Également vérifié : aucun débordement horizontal aux quatre largeurs ; les
commandes sont collantes et pleine largeur sur mobile (0 → 375) ; le dialogue
d'arrêt fait 1000 px, piège le focus et annonce « le classement serait vide »
quand aucune question n'a été jouée ; la salle passe en pastilles compactes
sous 700 px — 87 px de haut au lieu de 450 — **sans que les noms quittent le
document**, masqués à l'œil et non retirés, pour qu'un lecteur d'écran les
annonce toujours.

### Corrigé au passage

**Le `catch` muet de `ComposerSeance`.** Il avalait la cause d'un échec
d'enregistrement sans la journaliser : au lot 9, c'est lui qui a masqué un refus
de règles, et le diagnostic est venu du script de vérification, pas de
l'application. Il journalise désormais la panne et son code Firestore —
`permission-denied` désigne les règles, et c'est la première chose à regarder.
Le refus a d'ailleurs eu lieu **à nouveau** ce lot-ci, le modèle ayant changé :
cette fois la console l'a dit.

**Le titre des séances préparées.** La liste les distinguait par leur nombre de
questions et leur date ; elle affiche maintenant leur titre. Manque relevé au
lot 9, comblé ici.

---

## Ce que le lot 11 a construit — préparer une séance

**L'écran du lot 7 avait été assemblé sans maquette.** Il mêlait sur une seule
colonne la composition, les séances prêtes et l'historique, avec un pied
collant. Il est repris entièrement.

### La maquette découpe, et le code suit

Ce qui tenait sur `/admin/session` devient **trois routes** :

| Route | Ce qu'elle est |
|---|---|
| `/admin/session` | Séances prêtes et passées. La racine de la section, et ce que la navigation atteint. |
| `/admin/session/composer` | La composition. `?reprendre={id}` rouvre une séance préparée, `?ratees=a,b,c` part des questions qui ont trébuché. |
| `/admin/session/{id}` | Le détail d'une séance passée. |

Le détail est un **panneau** dans la liste au-delà de 1200 px, et une **vue à
part** en dessous — la maquette ne le dessine qu'à 1440, et en fait un écran
pour 1024 et 375. Les lignes de l'historique sont des liens à toutes les
largeurs.

### Le rythme vertical est une échelle

La maquette pose quatre mesures et s'y tient : « les lignes d'une même liste
respirent de 10, un bloc de 22, deux sections de 40, deux zones de sens
différent de 56 ». Elles vivent en variables CSS — `--air-ligne`, `--air-bloc`,
`--air-section`, `--air-zone` — et non en nombres semés dans le JSX. C'est ce
qui empêche la cinquième valeur d'apparaître au premier ajustement.

### Les détails de structure, et pourquoi ils comptent

**La banque défile dans sa propre zone.** Filtres au-dessus en `flex: none`,
groupes au milieu en `flex: 1; min-height: 0; overflow-y: auto`, « afficher 50
de plus » en dessous en `flex: none`. Sans `min-height: 0`, une piste de grille
refuse de descendre sous la hauteur de son contenu, et c'est la page qui
défilerait — les filtres partiraient au premier coup de molette.

**Une hauteur fixée est une hauteur fixée.** `.preparer` occupe exactement la
fenêtre (`height: 100vh`, `overflow: hidden`). La première version utilisait
`min-height`, et la page se mettait à défiler : la zone de défilement de la
banque devenait décorative, on descendait la page au lieu d'y descendre.
Mesuré après correction à 1440 × 900 : la page ne défile plus, la banque et le
panneau défilent chacun chez eux.

**Le panneau ne s'étire pas** (`align-self: start`) : il fait sa hauteur de
contenu à côté d'une banque qui prend toute la colonne. Deux surfaces de
hauteurs différentes, c'est voulu — l'une est une liste qu'on parcourt, l'autre
un formulaire qu'on remplit.

**À 1024, la composition change de navigation.** Les trois étapes deviennent
trois onglets — description et minutage, questions, ordre de passage. Ce n'est
pas un empilement : empiler aurait donné une page de trois mètres où l'on perd
de vue ce qu'on a retenu. La bascule se fait en CSS, sur un `data-onglet` porté
par la grille : rendre deux fois le panneau aurait dupliqué ses champs, son
`id` de chronomètre et le libellé que ce dernier désigne.

**Le numéro dans la case est le rang de passage**, pas une coche. C'est le lien
visuel entre la banque et l'ordre, et il doit se voir sans traduire.

**L'ordre de passage n'affiche que cinq lignes** et résume le reste. Un panneau
qui grandit avec la sélection finirait par pousser les deux boutons hors de
l'écran — exactement là où on en a besoin.

### Ce qui a été ajouté au modèle

| Champ | Pourquoi |
|---|---|
| `termineeLe` | « 18 min écoulées ». Écrit par la Cloud Function du bilan, au même passage et dans le même lot : deux déclencheurs sur le même événement seraient une course. |
| `presentsFinal` | « 9 présents sur 10 ». Sur la séance et non dans le bilan : la liste des séances passées l'affiche par ligne, et le lire dans le bilan coûterait une lecture par ligne. |

Nouveaux comportements : recherche dans la banque, filtres « jamais posées » et
« les plus ratées », tri par taux d'échec décroissant, formation entière d'un
geste, réordonnancement, reprise d'une séance préparée (`modifierSeance`),
« reprendre les ratées », et « lancer » depuis la composition.

**Un seul chemin d'ouverture.** « Lancer la séance » depuis la composition passe
par `preparerEtLancer`, qui **compose une séance en attente puis appelle
`lancerSeance`** — le même geste que le bouton « Lancer » de la liste. Écrire
directement une séance `encours` aurait créé un second chemin, qui aurait
divergé du premier à la première évolution : un champ posé ici et pas là, et la
salle d'attente s'ouvre sans heure d'ouverture. Un test le verrouille.

### La formule de durée change

La maquette calcule `n × (durée + 45 s)`, arrondi **à la minute**. Le lot 9
posait `n × durée × 2`, arrondi à cinq minutes.

**Le temps de commentaire ne dépend pas du chronomètre.** Révéler la bonne
réponse et la commenter prend le même temps qu'on ait laissé vingt secondes ou
soixante pour répondre ; doubler la durée de vote faisait croître le
commentaire avec la cadence. La maquette remplace une approximation par une
mesure du rythme réel.

L'arrondi à la minute plutôt qu'à cinq : « 18 min » est une estimation utile,
« 20 min » est la même estimation rendue plus vague sans rien gagner.

**Propagé aux deux autres écrans** — l'accès à la séance et la salle d'attente
affichent désormais le même calcul. La note du lot 9 est corrigée en
conséquence.

### L'abandon efface les réponses de la séance

**Décision reprise au lot 11, et elle affine celle du lot 10.** La maquette de
la page 6 annonçait « les réponses sont effacées » ; le lot 10 avait tranché de
garder le comportement et de corriger la maquette. Le lot 11 tranche autrement,
sur un périmètre précis :

- **Les réponses *de la séance*** — `sessions/{id}/reponses` — **sont
  effacées**. Elles ne servaient qu'au classement, il n'y en aura pas, et elles
  sont déjà invisibles de tous une fois la séance close. Invisible n'est pas
  effacé : une séance abandonnée ne laisse rien de nominatif derrière elle.
- **La progression de chacun** — `users/{uid}/reponses` et `users/{uid}/etats` —
  **ne bouge pas**. Ces réponses étaient réelles, elles comptent dans les
  questions à revoir. C'est la décision du lot 7, promise en toutes lettres à
  l'écran du participant. **Et elle ne pourrait pas être annulée proprement** :
  les compteurs d'`etats` ne redescendent pas — garantie des règles — et
  `questionStats` a déjà agrégé.

**L'ordre est garanti par le lot, pas par la chance.** Le bilan est calculé
depuis les réponses déjà lues en mémoire, et écrit **dans le même lot** que les
suppressions : ou les deux ont lieu, ou aucune. Il n'existe aucune fenêtre où
les réponses seraient parties sans que le bilan soit écrit. Le bilan est
anonyme — deux compteurs par question — et survit donc sans rien porter de
nominatif.

**Trois verrous sur la règle** : l'animatrice de cette séance et personne
d'autre, sur une séance `abandonnee` et pas une autre, jamais sur une séance
terminée — dont le classement se calcule précisément à partir de ces réponses.
Six cas de règles couvrent les deux sens, dont l'impossibilité pour un
commercial d'effacer sa propre réponse de séance ou de progression.

**Le texte dit les deux moitiés**, et l'une sans l'autre mentirait : « Les
réponses de la séance sont effacées, et il n'y a ni classement ni prix. La
progression de chacun est conservée : ce qui a été répondu reste dans les
questions à revoir. »

### Les écarts à la maquette

| Écart | Pourquoi |
|---|---|
| **Le rail d'icônes reste celui de la coquille** | La maquette dessine à 1024 un rail de 76 px, sans bouton de dépliage. `Coquille` se replie déjà à 68 px sous 1200 px avec infobulles — fonctionnellement le même rail. L'aligner au pixel toucherait **tous** les écrans du back-office, hors périmètre de ce lot. |
| **Le déplacement au clavier a été ajouté** | Hors maquette, et non négociable : la poignée de glisser-déposer qu'elle dessine n'existe ni au clavier ni pour un lecteur d'écran. Chaque ligne d'ordre porte deux boutons annoncés en toutes lettres — « Avancer « … » au rang 2 » — et la poignée reste pour la souris. |
| ~~**L'icône de déplacement a été tracée**~~ — **écart retiré, la note était fausse** | `ui.jsx` **définit** bien `drag` : deux barres horizontales, `M8 9.5h8M8 14.5h8`. La note affirmait le contraire sans rouvrir la source, et une poignée à six points avait été tracée à sa place. Le tracé de la maquette est repris. |

### Ce que la recette navigateur a trouvé

**Le `display` en ligne battait la feuille de style**, à nouveau. L'étape 3 du
panneau portait `display: 'flex'` en style en ligne : les onglets ne pouvaient
pas la cacher, et l'onglet « description » montrait les deux étapes. Sorti dans
le CSS. **C'est le même piège qu'au lot 9** sur la mise à plat mobile — une
primitive qui pose ses styles en ligne ne se reprend pas depuis une feuille.

**Le panneau de détail débordait à 375 px.** Il restait affiché sous la liste
alors que la maquette en fait une vue à part en dessous de 1200 px. Masqué, et
les deux pixels de débordement ont disparu avec lui.

**Le titre restait à 30 px sur téléphone.** La règle de 1199 px écrasait le
`clamp` ; la maquette le pose à 25 px.

Également vérifié : l'échelle `AIR` est bien celle de la maquette
(10 / 22 / 40 / 56) ; la grille vaut `minmax(0, 1fr) 452px` ; le bloc de mesure
des séances passées est fixé à 120 px ; la première ligne de l'historique est
mise en avant et les autres non ; aucun débordement horizontal à 1440, 1024 ni
375 px ; les trois onglets isolent chacun leur étape et n'existent qu'en
dessous de 1200 px.

**Un test a trouvé un défaut de structure.** `lignesTrebuchees` et `echecMoyen`
vivaient dans un composant client : le test a refusé de charger la
configuration Firebase pour calculer un pourcentage. Déplacées dans
`src/lib/session/bilan.ts`, module pur, et couvertes depuis.

### Le relevé de ce qui sort du flux

Le premier relevé du lot 11 avait noté **les zones qui défilent**. Il lui
manquait la moitié qui compte à l'usage : **les éléments qui en sortent**. Les
voici, écran par écran, avec ce que le navigateur mesure en défilant réellement
— un élément collant se vérifie en défilant, pas en lisant la règle qui le
déclare.

| Écran | Largeur | Ce qui sort du flux | Position | Repère |
|---|---|---|---|---|
| Composer | ≥ 1200 | Les deux actions du panneau | `sticky bottom` | Le panneau, qui défile chez lui |
| Composer | ≤ 1199 | Les deux actions du panneau | `sticky bottom: 0` | La page |
| Composer | ≤ 699 | Les deux actions du panneau | `sticky bottom: 0` | La page |
| Séances | ≥ 1200 | La carte de détail | `sticky top: clamp(24, 3vw, 44)` | La page |
| Séances | ≤ 1199 | La carte de détail | *masquée* — la maquette en fait une vue à part | — |
| Séances | ≤ 699 | « Préparer une séance » | `fixed bottom` | La fenêtre |
| Séance passée | ≤ 699 | « Reprendre les ratées » | `fixed bottom` | La fenêtre |
| Salle d'attente | ≤ 699 | Les commandes | `fixed bottom` | La fenêtre |
| Accès à la séance | ≤ 699 | Le bouton de jonction | `sticky bottom` | La page |
| Toutes | toutes | En-tête de coquille, rail de navigation | `sticky` / `fixed` | Inchangés |

**Trois règles tirées du relevé**, et elles valent au-delà de ces écrans.

**Une barre qui colle au bas d'un conteneur ne descend jamais plus bas que lui.**
`.preparer { padding-bottom: 96px }` réservait la place du pied fixe **sur tous
les écrans mobiles**, alors que seuls les Séances et le Détail en portent un. Sur
la composition, qui n'en a pas, cette réserve devenait un plancher : les actions
décrochaient de 126 px en fin de défilement. La réserve est passée sous
`:has(.preparer-pied-mobile)`, et elle ne s'applique donc qu'aux écrans qui en
ont un.

**Un conteneur qui rogne est un conteneur de défilement, et il tue le collant
qu'il contient.** `.salle-attente` porte `overflow: hidden` pour rogner le
collage décoratif. Les deux commandes du téléphone se déclaraient
`position: sticky; bottom: 0` — déclaration juste, effet nul : le repère du
collant devenait `.salle-attente`, qui ne défile jamais. **Mesuré : les boutons
remontaient de 644 à 181 px pendant le défilement, et ils commençaient déjà sous
la ligne de flottaison.** Passés en `fixed` — qu'un ancêtre `overflow: hidden` ne
rogne pas — avec une réserve de hauteur sur le corps, indexée sur le nombre de
commandes (deux en pause, trois avant le lancement) pour que le dernier présent
de la liste ne finisse pas sous la barre. **C'est une régression du lot 10 :** la
consigne disait « les boutons sont fixes sur mobile », le CSS le disait aussi, et
l'écran ne le faisait pas.

**Une barre collante se pose au ras du bord, pas du rembourrage.** Les actions du
panneau vont chercher les bords réels de la carte par des marges négatives
(`--panneau-rembourrage-cote`, `--panneau-rembourrage-bas`), sans quoi elles
laissent passer le contenu dessous en fin de course.

**La barre de défilement de la colonne de gauche venait de nous.** La maquette ne
la dessine nulle part. Elle est apparue quand `.preparer` a reçu
`height: 100vh; overflow: hidden` pour *tous* les écrans de la section : la
colonne devait alors porter sa propre zone de défilement. Or **seule la
composition est un cadre** ; les séances et le détail sont des pages, qui
défilent normalement. Le cadre est passé sur `.preparer--cadre`, la colonne a
retrouvé `overflow: visible`, et la barre a disparu avec sa cause.

**Ce que le navigateur a mesuré, en défilant.**

| Écran | Largeur | Défilement | Résultat |
|---|---|---|---|
| Composer | 1440 × 900 | panneau, 500 px | actions 777 → 776 |
| Composer | 1024 × 520 | page, 227 px | actions au bas de la fenêtre, 489 en fin de course (gouttière de 31 px) |
| Composer | 375 × 700 | page, 333 px | actions au bas de la fenêtre, 680 en fin de course (gouttière de 20 px) |
| Séances | 1440 × 900 | page, 300 px | détail figé à 43 ; colonne gauche `overflow: visible`, sans barre |
| Séances | 1280 × 800 | page, 273 px | détail 197 → 60 → figé à 38 (sa butée) |
| Séances | 375 × 700 | page, 1162 px | pied `fixed` à 700, un seul « Préparer une séance » visible |
| Séance passée | 375 × 700 | page | pied `fixed`, bouton de carte masqué, un seul « Reprendre les ratées » visible |
| Salle d'attente | 375 × 700 | page, 419 px | commandes figées à 556–700 ; réserve 164 px (deux commandes) et 226 px (trois) |
| Accès à la séance | 375 × 700 | page, 204 px | bouton au bas de la fenêtre, 680 en fin de course |

**Le `display` en ligne a battu la feuille une troisième fois.** `Bouton` pose
`display: inline-flex` en style en ligne : les actions dupliquées en pied mobile
ne pouvaient pas être masquées depuis le CSS. `!important`, comme au lot 9 et
plus tôt au lot 11. Le piège se voit au navigateur, jamais à la lecture.

---

## Le tour complet de la maquette — mise en forme

**Sept pages, 54 cadres, dont 47 dans le périmètre** — les sept autres sont
écartés plus haut, dans « En attente » et « Retiré faute de maquette ». Le tour
a été fait une fois, entièrement, plutôt qu'écran par écran au fil des
signalements.

### Ce que le tour a trouvé, et ce qui a été corrigé

| Écart | Correction |
|---|---|
| **L'indicateur de défilement** sur les zones qui défilent chez elles | Retiré partout — panneau de composition, banque de séance, liste des présents, corps de séance projetée, tiroir de navigation. La maquette n'en dessine à aucune largeur. Le défilement ne bouge pas : molette, pavé, flèches et `scrollIntoView` fonctionnent à l'identique, seul l'ascenseur disparaît. Mesuré : les deux zones défilent toujours, et réservent 0 px de large. |
| **L'icône de déplacement** | Le tracé de la maquette (`drag`, deux barres) remplace la poignée à six points inventée ici. Voir l'écart retiré, plus haut. |
| **00 · Connexion : le panneau de marque** | La maquette dessine deux parties : un panneau encre de 560 px — collage de trois formes, lockup, « Dix minutes par jour, et le catalogue *ne vous surprend plus* » — et le formulaire à droite. Le produit n'avait que la carte centrée. Le panneau est construit ; il disparaît sous 900 px, où la maquette mobile ne le dessine pas. |
| **02 · Question : la barre haute** | La maquette en fait un cadre de hauteur fixe — l'avancement ne part jamais. Sur une page réelle, à 375 px, il partait au défilement. Passé en `sticky`. La marque y figure au bureau, pas sur téléphone : c'est ce que les deux maquettes dessinent. |
| **Mobile : la barre d'action basse** | La maquette la pose au bas de **tous** les écrans du parcours. La série l'avait ; l'accueil et « À revoir » ne l'avaient pas — et l'accueil fait deux mille pixels à 375 px. Pied `fixed`, réserve de hauteur posée par `:has(.pied-mobile)` et **seulement** sur les pages qui en portent un. L'action reprise en pied quitte le corps : `action-doublee` la masque, `!important` parce que `Bouton` pose son `display` en style en ligne. |
| **01 · Accueil : l'en-tête en deux colonnes** | Le titre à gauche, la séance du jeudi dans une colonne de 232 px à droite, comme la maquette. La carte prend la forme dessinée — fond encre, picto, titre en serif, action pleine largeur. Elle s'efface d'elle-même quand aucune séance n'est ouverte (`:empty`). |
| **04 · Fin de série : le collage** | Les deux formes de la maquette — 118 et 74 px — sur la carte de score. Mesuré sur une série terminée. |
| **11 · Formations : le collage** | La forme de la formation, à 170 px, débordant du coin haut droit de chaque carte. Même fichier et même teinte que la pastille de 34 px : une carte ne porte jamais deux formes différentes. |
| **Les compteurs de navigation** | « Banque de questions · 214 » et « À revoir · 12 ». Deux requêtes d'**agrégation** — `getCountFromServer` — donc une unité de lecture chacune, pas une par question : c'est ce qui rend acceptable de les poser sur toutes les pages de la coquille. Un compteur qu'on ne sait pas calculer ne s'affiche pas : ni zéro, ni tiret. Le nombre est doublé en toutes lettres pour les lecteurs d'écran, « 12 » collé à « À revoir » ne se lisant pas tout seul. |
| **Salle d'attente : le QR code** | La maquette le pose à **chaque** largeur et sa phrase y renvoie ; il n'existait pas, et ce n'était dans aucun des quatre écarts déclarés du lot 10. Construit sur `qrcode-generator`, importé par le seul écran qui s'en sert. Il encode l'adresse **et** le code, depuis la constante partagée avec la route : un QR qui pointerait ailleurs que le lien dicté serait la pire des deux options. Rendu en SVG — à 208 px sur un vidéoprojecteur, les modules doivent rester des carrés nets. |

### Ce qui reste, et pourquoi

| Écart | Pourquoi il n'est pas corrigé |
|---|---|
| **Le fichier du logo** | `assets/medere-icon-white.png` existe dans le projet Design et n'est pas dans le dépôt ; `Marque` trace deux barres à sa place. **Le fichier ne peut pas être déplacé par cette voie** : un binaire recopié à travers la conversation arrive tronqué — vérifié, le PNG reconstitué faisait 2 667 octets au lieu de 6 000 et ses CRC tombaient faux. Un fichier à déposer dans `public/`, pas un écart de code. |
| **« 214 questions » sur l'écran de connexion** | Le nombre réel ne peut pas être lu là : c'est le seul écran qui ne charge pas Firestore, et l'y remettre coûterait 166 ko au premier écran de chaque visite — règle de performance acquise, voir `CLAUDE.md`. La phrase garde sa substance sans le chiffre. Un nombre inventé serait pire qu'un nombre absent. |

### Ce que la recette navigateur a mesuré

Écrans rechargés et défilés pour de vrai, aux largeurs de la maquette.

| Écran | Largeur | Mesure |
|---|---|---|
| Composer | 1440 × 900 | panneau et banque défilent toujours, ascenseur réservé 0 px, `scrollbar-width: none` |
| Accueil | 1440 | en-tête en ligne, colonne de séance à 232 px, masquée quand vide ; compteur « À revoir 1 » |
| Accueil | 375 × 700 | pied `fixed` à 564–700 sur 1 296 px de défilement, action du corps masquée, 32 px de dégagement |
| À revoir | 375 × 700 | pied `fixed` à 700, **un seul** « Série de rattrapage » visible |
| Série | 375 × 420 | barre haute figée à 0–78 et pied à 420 sur tout le défilement ; marque masquée |
| Série | 1440 × 520 | marque affichée, 118 px, barre haute figée |
| Fin de série | 1440 | les deux formes à 118 et 74 px, rognées par la carte, le score au-dessus |
| Formations | 1440 | 60 cartes, décor de 170 px sur chacune ; compteur « Banque de questions 14 » |
| Salle d'attente | 1920 / 1280 / 900 / 390 / 375 | QR à 208 / 150 / 128 / 88 / 88 px — les quatre densités de la maquette |
| Connexion | 1440 / 1024 / 900 / 899 / 375 | panneau à 560 px, puis 42 vw, masqué sous 900 px |

**Le QR a été vérifié sur sa structure, pas seulement sur son apparence** : les
trois repères d'angle sont exacts au module près, la zone franche est propre, et
la grille dessinée par le navigateur — 29 modules, 422 modules noirs — est
identique à celle que la bibliothèque produit en Node pour la même URL. Le rendu
reproduit donc la sortie de la bibliothèque sans la déformer.

**Réserve honnête sur la connexion** : l'écran ne s'atteint qu'en étant
déconnecté. Sa feuille de style a été éprouvée sur la structure réelle, aux cinq
largeurs ; l'écran lui-même n'a pas été vu dans le navigateur.

---

## Le tour complet — fonctionnel 11 : objectif du jour et régularité

**Tranché : construire.** C'est la seule mécanique d'assiduité de l'outil, et
c'est elle qui décide si l'on revient le lendemain.

### Aucune collection par jour

Un document par utilisateur et par jour, c'est mille documents par commercial
sur trois ans — et surtout une requête de sept documents **à chaque ouverture de
l'accueil** pour afficher sept pastilles. Ce que la maquette dessine tient dans
trois nombres et sept clés de jour : un champ `assiduite` de taille constante
(~120 octets) dans le document de progression que l'accueil lit déjà et que la
fin de série écrit déjà. **Zéro document, zéro lecture, zéro écriture en plus.**

La borne des sept entrées vit **dans les règles**, pas seulement dans le code
qui écrit : le choix de n'avoir aucune collection ne tient que si la règle
l'impose.

### Une série se rompt sans qu'on écrive rien

Personne ne touche la base le jour où l'on ne joue pas. Le nombre en base vaut
donc « la série *au* dernier jour actif », et **celle qu'on affiche est dérivée
à la lecture** : vivante si ce jour est aujourd'hui ou hier, nulle au-delà.
Stocker un zéro qui ne s'écrit jamais aurait demandé une tâche planifiée pour
une pastille. La semaine suit la même règle — purgée à l'écriture, filtrée à la
lecture, sans quoi une semaine passée s'afficherait comme la semaine en cours.

### Le jour se calcule à Paris

Ni en UTC, ni dans le fuseau de l'appareil : sinon la frontière du jour bouge
d'un commercial à l'autre, et « hier » cesse d'être la même chose pour tout le
monde. Trois tests le verrouillent, dont le passage à l'heure d'été.

**Limite assumée** : c'est l'horloge du navigateur qui décide du jour. Voir le
README, « Assiduité ».

### Un détail de la maquette qui a failli être mal lu

Les pastilles de samedi et dimanche sont neutres **parce que c'est le
week-end**, pas parce qu'elles sont à venir. La première version avait lu
« passé / à venir » et dessinait un vendredi non arrivé comme un dimanche.
Trois états, et le jour de la semaine décide : fait, jour ouvré à faire, repos.
Un vendredi à venir se dessine donc comme un lundi manqué — la maquette n'en
fait pas deux états, et la pastille dit « à faire », pas « raté ». Le texte
réservé aux lecteurs d'écran, lui, distingue les deux : c'est une information,
et elle ne coûte rien.

**Les lettres ne suffisent pas.** « M » désigne le mardi et le mercredi ; chaque
pastille porte son jour et son état en toutes lettres.

### Ce que la recette a mesuré

Sur l'écran réel, contre les **règles déployées** (vérifiées identiques au dépôt
par `npm run regles:verifier`) :

- une série terminée écrit l'assiduité : jeudi passe en `fait`, turquoise
  `rgb(23, 190, 187)` — la teinte de la maquette ;
- **une seconde série le même jour ne fait pas monter la série** : « 1 jour
  d'affilée · record 1 » avant et après, et l'intitulé bascule sur « C'est fait
  pour aujourd'hui ». C'est la régularité qui est mesurée, pas le volume ;
- aucune erreur de règles en console sur le trajet complet ;
- pastilles de 38 × 46 au bureau, 26 × 30 sous 900 px — les deux maquettes ;
- aucun débordement horizontal à 899, 700, 499 ni 375 px, et le pied fixe de
  l'accueil tient toujours sur 1 738 px de défilement.

---

## Le tour complet — fonctionnel 12 : les neuf récompenses

**Deux systèmes, pas un.** Les *prix* sont des trophées d'un jeudi vécu :
`users/{uid}/prix`, écrits par la seule Cloud Function, un rang et une séance.
Les *récompenses* sont des paliers individuels de maîtrise et d'assiduité.
L'écran doit les séparer, et pas seulement par une légende.

### Un défaut du lot 11, trouvé en construisant celui-ci

**Le week-end cassait la série.** `apresUneSerie` comparait au jour calendaire
précédent : un commercial qui travaille du lundi au vendredi voyait sa série
repartir à un chaque lundi, et son record plafonner à cinq. « Dix jours
d'affilée » était donc **inatteignable** — et la maquette neutralise elle-même
samedi et dimanche, « rien à rattraper un dimanche ». On ne peut pas à la fois
ne rien demander le week-end et le compter comme une absence.

La série compte désormais en **jours ouvrés** : vendredi puis lundi, elle tient ;
vendredi puis mardi, elle repart. Jouer un samedi ne rompt rien et compte comme
un jour joué — le calendrier ouvré ne décide que des absences qui brisent.

### Où elles vivent, et pourquoi ça ne grossit pas

Une carte `recompenses` sur `users/{uid}` : **une entrée par palier obtenu, la
date pour valeur.** La liste des récompenses est un **ensemble fermé défini dans
le code** — neuf entrées aujourd'hui, une de plus le jour où l'on en ajoute une,
jamais une par usage. Écrite dans la transaction de fin de série qui existait
déjà : zéro document, zéro lecture, zéro écriture en plus.

**Les règles plafonnent à 24 entrées et interdisent d'en retirer ou d'en
réécrire une.** Les neuf identifiants n'y sont **pas** figés, contrairement aux
avatars : les y inscrire imposerait un déploiement de règles à chaque palier
ajouté, avec le risque de désynchronisation que le lot 3 a payé assez cher. Le
plafond borne la croissance, et c'est son seul rôle.

### Stockées, et non dérivées

Sept des neuf se calculent depuis ce que l'accueil charge déjà. **Mais une
valeur dérivée se perd** : « toutes les formations au-dessus de 80 % »
s'évanouirait le jour où Noémie publie une question de plus. Une récompense est
un fait du passé, une valeur dérivée est un fait du présent — c'est la décision
du lot 7 sur les prix, appliquée ici. Elles sont donc **accordées à l'évènement**,
là où le fait est constaté, et l'avancement vers un palier non obtenu (« encore
6 jours ») reste calculé à la lecture.

« Première séance collective » est accordée par la **Cloud Function qui écrit
déjà les prix**, dans le même lot — aucun second déclencheur. Elle relit avant
d'écrire : `mergeFields` écraserait la date, et « première séance » afficherait
alors celle de la dernière.

### Trois reformulations assumées

| Maquette | Produit | Pourquoi |
|---|---|---|
| Catalogue **dentaire** maîtrisé | Une formation entièrement maîtrisée | Le catalogue vient d'Airtable et change. |
| Cinq **séries** en une semaine | Cinq **jours actifs** dans la semaine | Le volume, alors que tout le reste de l'outil compte la régularité. |
| Un mois complet sans absence · Série parfaite **deux jours de suite** | Vingt jours d'affilée · Une série sans faute | Demanderaient un historique par série que rien d'autre ne justifie. |

### Ce qui sépare une récompense d'un prix

Quatre séparations, dont une ajoutée hors maquette :

1. **Les mots du bloc.** « Récompenses — paliers franchis sur le catalogue, sans
   rapport avec le jeudi » contre « Vos prix ».
2. **Les mots de l'élément.** Un prix nomme **toujours** une séance et sa date ;
   une récompense dit **« Palier atteint le… »** et ne nomme ni rang ni médaille.
   Un test le verrouille sur les neuf libellés.
3. **La forme.** Les prix sont des cartes à deux lignes ; les récompenses une
   liste compacte picto + libellé.
4. **Les teintes, séparées — hors maquette.** Turquoise, jaune et argent disent
   « Diamant », « Or », « Argent » sur le même écran. Aucune récompense ne les
   emprunte ; elles tirent des cinq autres teintes plus l'encre. **Deux systèmes
   qui partagent une couleur sont deux systèmes qu'on confond**, et un test
   l'interdit.

### Ce que la recette a mesuré, sur l'écran réel

Contre les **règles déployées**, vérifiées identiques au dépôt :

- une série jouée a porté une formation à 100 % : le palier a été **accordé dans
  la transaction et accepté par les règles**, et l'accueil affiche « Une
  formation entièrement maîtrisée — **Palier atteint le 17 septembre** » ;
- **les deux systèmes ne se croisent pas** : les trois prix sont turquoise
  `rgb(23, 190, 187)` et disent « Diamant · séance du 15 septembre » ; la
  récompense obtenue est orange `rgb(241, 153, 83)` et dit « Palier atteint
  le… » ;
- les jauges des paliers non obtenus disent où l'on en est : « 2 sur 5 », « 1
  sur 5 cette semaine », « 1 sur 10 » ;
- colonne de droite à **300 px** au-delà de 1100, une seule colonne en dessous ;
- aucun débordement horizontal à 1440, 1100, 1099 ni 375 px, et le pied fixe de
  l'accueil tient toujours sur 2 112 px de défilement.

**Quatre pictogrammes ont été repris du jeu livré** — médaille, suivi, soin,
dentaire. Chaque transcription a été **rastérisée dans le navigateur et relue**
avant d'être gardée : un chemin SVG recopié se vérifie, il ne se suppose pas.

---

## Le tour complet — 00 · Connexion, mobile 390

Livrée après le desktop, reprise ici. **Le panneau d'encre ne disparaît pas : il
devient un bandeau haut**, court, qui garde la promesse et le collage — deux
formes au lieu de trois, à leurs positions propres. Le formulaire prend le
reste, la carte se met à plat, et l'action descend au pouce.

**Aucun élément fixe.** L'écran occupe la fenêtre et se partage en trois :
bandeau à sa hauteur de contenu, corps élastique, action poussée au bas par une
marge automatique. Un pied `fixed` sur un écran qui ne défile pas ne servirait
qu'à masquer le clavier logiciel.

**Une adaptation sous 389 px**, mesurée puis corrigée : à 375 × 667, le bandeau
de 324 px poussait l'action dix-neuf pixels sous la ligne de flottaison. La
borne est à 389 et non à 399 pour que **390 garde exactement la maquette**.

Mesuré sur l'écran servi : bandeau de 324 px à 390, de 300 px à 375 ; action à
747–822 sur un écran de 844, à 580–647 sur un écran de 667 ; **aucun défilement
et aucun débordement** à 375 × 667, 390 × 780 et 390 × 844 ; le panneau latéral
reprend sa place à 900 px, à 560 px de large à 1440.

---

## Le podium des prix — trois marches fixes

**Le nombre de cartes ne dépend plus de ce qui a été gagné.** La liste
chronologique est remplacée par trois cartes côte à côte — Diamant, Or, Argent,
dans cet ordre, toujours. Deux Or gagnés font un « 2 » dans la carte Or, jamais
une seconde carte.

**Une distinction jamais obtenue reste à sa place, en grisé**, avec un tiret
plutôt qu'un zéro : la marche est libre, elle n'est pas un échec chiffré. Un
podium vide montre ses trois marches — c'est ce qui donne envie d'y monter.

Les séances jouées sans distinction n'ont pas de marche : elles sont comptées
sous le podium, en une ligne. L'indice du titre garde le rapport — « 3 sur 5
séances ».

Sur téléphone les trois marches restent **côte à côte** et se resserrent : le
médaillon passe au-dessus du nombre. Les empiler ferait trois lignes là où un
podium se lit d'un regard.

---

## Le tour des versions mobiles

Sept divergences relevées page par page contre les maquettes mobiles, puis
corrigées et vérifiées en défilant à 375 et 390 px.

| # | Écran | Ce qui divergeait | Correction |
|---|---|---|---|
| 1 | 01 · Accueil | **La jauge de maîtrise par formation disparaissait** — largeur mesurée à 0 px. La règle générale des lignes de tableau donne `width: auto` aux colonnes fixes, et une jauge n'a aucune largeur propre. | Pleine largeur sous le nom, comme la maquette. Mesurée à 303 px. Le nombre de questions quitte l'écran : la maquette mobile ne le dessine pas et il volait la largeur au nom. |
| 2 | 01 · Accueil | Les récompenses s'affichaient en liste avec libellés et dates ; la maquette mobile ne montre que **quatre médaillons**. | Rangée de médaillons de 46 px. **Le texte quitte l'œil, pas le document** : il est rogné à 1 × 1 px, jamais `display: none`, pour qu'un lecteur d'écran continue de l'annoncer. |
| 3 | 02 · Question | L'énoncé faisait 21 px ; la maquette mobile le pose à **26**. C'est le texte qu'on lit, et il était plus petit qu'une option de réponse à deux lignes. | Plancher relevé à 26 px, 23 pour une mise en situation dont le contexte est déjà affiché au-dessus. Le bureau ne bouge pas. |
| 4 | 02 · Question | L'aide clavier — « 1 2 3 4 pour cocher, Entrée pour valider » — s'affichait sur téléphone. **Il n'y a pas de clavier**, et elle volait la place du libellé de l'action. | Masquée sous 700 px. Toujours là au bureau. |
| 5 | 03 · Correction | Le verdict passait **après** l'énoncé et les quatre options : on descendait pour savoir si l'on avait juste. | `order: -1` sous 760 px — le verdict d'abord, comme la maquette. Mesuré : verdict à 98 px, énoncé à 346. Au bureau, les deux colonnes restent côte à côte. L'énoncé passe à 19 px, la taille de la maquette : à la correction, ce n'est plus lui qu'on lit en premier. |
| 6 | 05 · À revoir | Les quatre filtres de format s'affichaient sur deux lignes ; la maquette mobile ne les dessine pas. | Masqués sous 700 px. **Écart assumé** : on perd le filtrage sur téléphone. La liste y est courte, et le réglage reste dans l'URL. |
| 7 | 04 · Fin de série | La carte « Récompenses obtenues » manquait — **aux deux largeurs**. Relevée pendant le lot 12, pas corrigée. | `crediterSerie` rend les paliers **nouvellement** franchis, et la fin de série les annonce avec leur étiquette « Nouveau ». Ceux qu'on avait déjà n'en font pas partie : « vous venez de gagner » ne se dit pas d'un palier franchi le mois dernier. |

**Ce que la recette a mesuré en défilant**, à 390 × 844 et 375 × 667 : le pied
fixe de l'accueil tient sur 1 922 px de défilement, la dernière carte s'arrête
33 px au-dessus ; podium à trois colonnes de 110 px (105 à 375), médaillon
au-dessus du nombre ; aucun débordement horizontal ; et au bureau, rien n'a
bougé — deux colonnes à la correction, aide clavier présente, énoncé à 30 px.

---

## Le tour des versions mobiles — seconde passe

**Le premier relevé n'était pas complet.** Il échantillonnait ; celui-ci regarde
le contenu rendu de chaque écran, à 375 et à 390, en défilant. Quatre défauts de
plus, dont un sur l'écran le plus ouvert du produit.

| Écran | Ce qui divergeait | Correction |
|---|---|---|
| 02 · Question | **La consigne était dite deux fois** : sous l'énoncé, puis à côté du bouton fixe. Et le bouton n'occupait pas la largeur. | L'indication du pied disparaît sous 700 px, le bouton passe pleine largeur (343 px mesurés à 375). La consigne sous l'énoncé, elle, reste — c'est elle qui porte la règle. |
| 04 · Fin de série | **Les deux actions se chevauchaient.** Et « Retour à l'accueil » figurait en pied alors que l'en-tête porte déjà ce libellé une fois la série finie. | Chaque action pleine largeur, l'une sous l'autre (mesuré : y 721 et 784, aucun recouvrement). Le bouton fantôme du pied est retiré — **aux deux largeurs** : un même geste à deux endroits du même écran n'en fait pas un plus accessible. |
| 06 · Rejoindre la séance | **« Rejoindre » défilait avec le contenu.** Il était `sticky` au bas de la carte du formulaire — et une barre collante ne sort jamais de son conteneur : dès que la carte passait, le bouton partait avec elle. | `fixed`, comme les pieds de l'accueil et d'À revoir, au même seuil de 700 px. Mesuré : tient à 844 sur tout le défilement, 25 px de dégagement au bout. **Troisième fois que ce piège se présente** — il est désormais noté ici comme motif. |
| 06 · Rejoindre la séance | Les formes turquoise et rose du fond s'affichaient ; **la maquette mobile n'en dessine aucune**. | Retirées du document sous 900 px, pas seulement masquées : quatre images téléchargées pour n'être jamais peintes ne valent rien sur un téléphone. |

**Ce que la seconde passe a vérifié, écran par écran**, à 375 × 667 et
390 × 844 : accueil, à revoir, série (question, correction, fin), rejoindre la
séance et son état d'erreur, salle d'attente, séances collectives, composer,
banque, import, statistiques, formations. Pour chacun : aucun débordement
horizontal, aucun bouton qui en recouvre un autre, et **chaque élément hors du
flux mesuré avant et après un défilement complet** — tous tiennent.

**Une divergence gardée**, et c'est délibéré : la maquette mobile retire l'aide
du champ de code (« six caractères, annoncés à voix haute ») parce que son
paragraphe d'introduction le dit déjà. Le produit, lui, change ce paragraphe
quand une séance est ouverte ; retirer l'aide ferait disparaître l'information
dans ce cas. Elle reste.

**Une limite de la sonde, notée pour la prochaine fois** : un détecteur de
recouvrement signale toute la matière qui passe *sous* une barre fixe pendant le
défilement. Ce n'est pas un défaut — la réserve de bas de page garantit qu'on
atteint la fin. Ce qui se vérifie est le dégagement **en fin de course**, et il
a été mesuré partout : 25 à 33 px.

---

## Le tour complet — fonctionnel 13 : « À l'argumentaire » et l'attribution

**Deux textes, pas deux formulations d'un même.** Le verdict dit pourquoi la
réponse est juste ; la carte dit quoi en faire au téléphone. C'est l'objectif
métier : le commercial vient chercher la phrase qu'il redira à l'appel suivant.

Posée sur les **deux écrans qui corrigent** — la série et la séance côté
participant. Pas sur l'écran projeté : la maquette 10d n'en dessine pas, et un
argumentaire ne se lit pas à cinq mètres.

### L'argumentaire est facultatif, et ce n'est pas une facilité de transition

Une question de fait — « les assistants dentaires ont-ils un RPPS » — **n'a pas
d'angle de vente**. En exiger un produirait du remplissage, et le remplissage
est pire que l'absence : le commercial apprend à sauter la carte.

Quand il est vide, **la carte ne s'affiche pas** : ni cadre creux, ni texte
d'attente. Vérifié sur l'écran — une question sans argumentaire ne montre ni la
carte ni la signature.

L'éditeur le signale comme une **suggestion** : pastille creuse sous la liste
des contrôles, pas alerte rouge. Un contrôle rouge dit « vous ne pouvez pas » ;
celui-ci dit « vous pourriez ». Les mêmes pastilles pour les deux auraient fait
de l'argumentaire une obligation de fait.

### L'attribution : celle qui écrit recopie son nom

`users/{uid}` est fermé **sans exception administrateur** : une question n'a pas
le droit d'y chercher le nom de Noémie. C'est exactement le problème de
l'animatrice au lot 10, et la même réponse — `explicationAuteur` est inscrit sur
la question au moment de l'enregistrement, par celle qui enregistre. Personne ne
lit les données privées d'un autre.

### La date dit ce qu'elle annonce

**`explicationMajLe` n'est pas `modifieeLe`.** Le second suit chaque
enregistrement — c'est ce qui classe la banque par récence, et c'est son rôle.
Le premier ne bouge que lorsque l'explication ou l'argumentaire changent
vraiment : sans cela, « mise à jour le 3 mars » sur un changement de virgule
n'apprendrait rien, et **une date fausse ressemble exactement à une date
juste**.

La comparaison ignore les espaces de bord et les espaces répétés — une espace en
fin de ligne n'est pas une mise à jour — mais ne juge pas de l'ampleur d'une
réécriture : ce n'est pas au code de décider qu'une reformulation est mineure.

**Et c'est une garantie, pas une politesse du client** : les règles refusent
toute écriture qui ferait avancer la date sans toucher au texte.

### Ce que la recette a mesuré, contre les règles déployées

- L'éditeur porte le champ « À l'argumentaire — facultatif » et sa suggestion.
- Un argumentaire écrit, puis publié : **accepté**, et l'écran de correction
  affiche la carte puis « Explication rédigée par Dethie Faye · mise à jour le
  18 septembre ».
- **La preuve de bout en bout de la date** : après cette écriture, une
  modification du seul thème a été enregistrée **sans refus**. Or les règles
  déployées rejettent toute écriture qui avance la date sans changer le texte —
  un enregistrement accepté prouve donc que le client ne l'a pas touchée.
- Une question sans argumentaire : ni carte, ni signature.
- À 390 px, le verdict reste en tête et porte les trois blocs ; bouton d'action
  pleine largeur, aucun débordement.

---

## Le tour complet — fonctionnel 14 : le statut « À relire »

### Où il se place, et pourquoi

**À côté de « publiée », pas entre le brouillon et elle.** Il dit « cette
question demande du travail », pas « elle ne sort plus » — et les deux statuts
servent aux commerciaux.

1. **Le signal qui met une question à relire est un taux d'échec**, donc des
   réponses. La retirer figerait la statistique au moment du marquage : on
   perdrait le seul moyen de savoir si la réécriture a servi.
2. **Une question mal formulée reste une question vraie.** Sa bonne réponse ne
   devient pas fausse parce que l'énoncé est confus ; la retirer punirait le
   commercial du retard de Noémie.
3. **Il existe déjà un état pour « ne sort plus » : le brouillon.** Un troisième
   statut qui ne sortirait pas serait un second brouillon.

Le corollaire est écrit dans l'éditeur, sous l'étiquette : « elle entre toujours
dans les séries ; pour la retirer, enregistrez-la en brouillon ».

### Ce que le troisième statut change, et qui ne se voyait pas

**Les règles refusaient toute réponse à une question non publiée.** Le verdict
n'est pas déclaratif : il est recalculé depuis la question, et la clause
exigeait `statut == 'publiee'`. Sans y ajouter « à relire », la question aurait
continué de sortir dans les séries — elle est servie — et **chaque réponse
aurait été rejetée**, le commercial voyant « enregistrement incomplet » sans
rien comprendre. C'est le genre de défaut qui ne se trouve pas en lisant
l'écran.

Six lectures filtraient sur `publiee` seul et filtrent désormais sur les
statuts servis : tirage navigateur, référentiel serveur, composition d'une
séance, question courante d'une séance, compteur de navigation, statistiques.

**Et deux phrases sont devenues fausses**, trouvées en vérifiant les chiffres :
l'en-tête de la banque annonçait « seules les questions publiées entrent dans
les séries », et le compteur de navigation se lisait « 14 publiées ». Les deux
disent maintenant « servies aux commerciaux », et l'en-tête ajoute la
distinction utile : « un brouillon n'entre dans aucune série ; une question à
relire, si ».

### Qui marque, et depuis où

**Le signal est automatique, la décision ne l'est pas.** L'écran des
statistiques classe par taux d'échec et pose sur chaque ligne un bouton
« Marquer à relire » : la décision se prend là où le signal existe, sans ouvrir
la question.

**Le statut n'est pas écrit par une fonction automatique**, et c'est délibéré :
`questionStats` est un cumul depuis la mise en service, sans fenêtre glissante.
Une question ayant franchi le seuil une fois y resterait pour toujours — et se
remarquerait toute seule après chaque réécriture, contre Noémie. La machine
remarque, l'humaine décide.

Le geste est sans conséquence pour les commerciaux — la question continue de
sortir —, et c'est ce qui permet de marquer librement.

### Ce que la recette a mesuré, contre les règles déployées

- Les quatre onglets de la banque, et l'étiquette jaune d'attention.
- Un clic depuis les statistiques : **accepté**, aucune erreur en console, et le
  bouton cède la place à l'étiquette sans rechargement.
- **La vérification qui compte** : une question marquée à relire est **sortie
  en première question d'une série**, et la réponse a été **enregistrée sans
  refus** — la clause de règle tient.
- Les compteurs suivent : 16 questions, 14 servies, 3 à relire.

**Une observation, et son explication.** Après le premier marquage, deux
questions portaient l'étiquette au lieu d'une. Une expérience contrôlée —
compter les boutons avant et après un clic — a donné exactement un marquage par
clic, à deux reprises : le chemin de code est sain. La cause était ailleurs, et
Déthié l'a donnée : **un second administrateur essayait la fonctionnalité au
même moment**. Deux comptes, deux marquages.

La leçon tient en une ligne, et elle est déjà dans `CLAUDE.md` : un diagnostic
qu'on n'a pas reproduit reste une hypothèse. Ne pas en inventer une valait mieux
que d'en écrire une fausse.

---

## Le tour complet — fonctionnel 15 : « Verrouiller l'accès »

La pastille au pied du panneau « Dans la salle », dessinée aux trois grandes
largeurs de la maquette 6 (`Participants`, `!compact`). Elle n'existait pas.

### Le verrou ne ferme qu'une porte

**Une seule clause de règle, à la création d'un marqueur de présence.** C'est
tout ce que « verrouiller » fait, et c'est ce qui rend les trois réponses
faciles à tenir :

```
allow create: if domaineAutorise()
  && estProprietaire(participantUid)
  && participantValide(request.resource.data)
  && salleOuverte(sessionId);       // statut joignable ET porte non fermée
```

Le mot suggère trois choses qu'il ne fait pas, et aucune ne se produit : il ne
met pas la séance en pause — le vote continue —, il ne sort personne — les
marqueurs existants sont intacts —, il ne périme pas le code, qui resert dès la
réouverture. **La réponse au troisième point — « rien ne change pour ceux qui
sont déjà là » — n'est donc pas une intention de code : c'est une conséquence
de l'endroit où la clause est posée**, et sept tests la vérifient porte fermée :
voter, corriger son nom, se relire, se reconnecter.

`salleOuverte` lit la porte par `.get('verrouillee', false)` : la Cloud Function
du bilan écrit par le SDK Admin, hors de `sessionValide`, et **une porte absente
est une porte ouverte**.

### Deux refus, et surtout pas le même message

« Ce code ne mène nulle part » et « la salle est fermée » demandent deux gestes
opposés : relire le code, ou se signaler à l'animatrice. Les confondre enverrait
quelqu'un chercher une faute de frappe dans un code juste.

- **Code inconnu** — le champ se marque, comme avant.
- **Salle fermée** — **le champ ne se marque pas** : il n'y est pour rien. Un
  encart `role="status"` dit, dans cet ordre, que le code est bon, que la porte
  est fermée, et que l'animatrice peut la rouvrir. La barre d'action reprend la
  même substance en une ligne, parce que sur téléphone elle est fixe et que
  l'encart peut être remonté hors de l'écran au moment du clic.

**Et la porte s'annonce avant la première frappe.** L'étiquette de tête passe de
« Séance ouverte » à « Accès fermé » quand la séance qui tourne est verrouillée.
Remplir le formulaire entier pour s'entendre répondre « fermé » aurait été un
piège poli.

### Ce que le navigateur a trouvé, et que la lecture n'aurait pas vu

**Un présent qui recharge son onglet repasse par l'écran d'accès.** `sessionId`
ne vit que dans l'état React. Deux défauts sont tombés là, et aucun n'était
visible à la lecture :

1. **La reconnexion était refusée, verrou ou pas.** `rejoindre` écrivait
   `rejointLe: serverTimestamp()` à chaque passage ; les règles interdisent de
   faire bouger cet horodatage sur un marqueur existant — c'est ce qui empêche
   quiconque de réécrire son heure d'arrivée. L'écran annonçait donc « la
   recherche n'a pas abouti » à quelqu'un qui était dans la pièce. La jonction
   fusionne désormais, et n'écrit l'horodatage que s'il n'y en a pas.
2. **Le client refusait d'avance sur `verrouillee`.** Économique en apparence —
   une lecture qu'on a déjà, un aller-retour de moins — et faux : la règle,
   elle, aurait laissé passer le présent qui recharge. **La règle est seule
   juge ; l'écran ne parle qu'après elle.** On tente, et on n'explique le refus
   qu'après l'avoir relu.

L'encart « accès fermé » est par ailleurs tu pour quelqu'un qui figure dans la
liste des présents affichée juste à côté.

### Ce que la recette a mesuré, contre les règles déployées

Séance neuve `VSRLAN`, écran d'animation et écran d'accès, dans deux onglets.

| Geste | Résultat |
|---|---|
| Verrouiller | Pastille jaune `rgba(254,202,69,.3)`, `aria-pressed=true`, « Rouvrir l'accès » ; la ligne au-dessus du code passe à « Accès fermé, ce code n'ouvre plus », la puce d'état au jaune ; **le code reste lisible**, il resservira |
| Rejoindre, porte fermée | Étiquette « Accès fermé » **avant** la frappe ; après l'envoi, encart « Votre code est bon… », **champ non marqué**, barre « Le code est bon, mais l'accès est fermé » ; personne n'entre |
| Rouvrir, puis rejoindre | Entrée immédiate, **même code**, aucun refus |
| Verrouiller, puis recharger l'onglet d'un présent | Étiquette « Séance ouverte », aucun encart, et le même code fait rentrer |
| Déverrouiller | Retour au vert, « Code à dicter à la salle » |

Aucun rejet de promesse non traité, aucune erreur en console, sur l'ensemble du
parcours.

**Les quatre densités**, mesurées dans un banc en cadre aux largeurs de la
maquette — l'écran physique plafonne à 1280 :

| Largeur | Police | Icône | Rembourrage | Rayon | Gouttière sous le panneau |
|---|---|---|---|---|---|
| 1920 | 19 px | 21 px | 14 / 20 px | 999 px | 28 px |
| 1280 | 18 px | 20 px | 11 / 16 px | 999 px | 22 px |
| 900 | 18 px | 20 px | 11 / 16 px | 999 px | 22 px |
| 390 / 375 | 18 px | 20 px | 11 / 16 px | 999 px | 22 px |

Ce sont les valeurs de la maquette : `s.metaL`, `s.metaL + 2`, et `14px 20px`
au-delà de `s.pad >= 56`. La pastille ne passe jamais à la ligne — 185 à 201 px
de large — et reste dans le panneau à toutes les largeurs. **À 375 × 700,
défilement complet de 451 px** : la pastille finit à 404 et sa ligne d'aide à
452, au-dessus de la barre fixe des commandes qui commence à 498. Rien ne passe
dessous.

**Un piège évité de justesse, et c'est le CSS qui l'a signalé.** L'icône était
dimensionnée par `taille="var(--sa-verrou-icone)"` : un attribut `width` de SVG
ne résout pas un `var()`, et la variable n'existait même pas. Le navigateur a
rendu l'attribut littéral sans rien dire. La taille vient maintenant de la
feuille, où vit déjà l'échelle des quatre densités.

**Une déviation assumée.** La maquette ne dessine pas la pastille sur téléphone
— parce qu'elle n'y dessine pas le panneau du tout. Le produit, lui, le compacte
plutôt que de le supprimer, décision du lot 10 ; la pastille voyage donc avec
lui. **Une porte qu'on ne peut fermer que depuis une machine est une porte qu'on
n'ose pas fermer.**

### Un troisième mot périmé, trouvé en passant

L'écran de composition annonçait « 14 publiées, 0 retenues » au-dessus d'une
banque qui contient aussi les questions à relire — troisième phrase de cette
famille après l'en-tête de la banque et le compteur de navigation. Corrigée, et
le nom qui la produisait avec elle : `questionsPubliees` devient
`questionsServies`, `useNombreDeQuestionsPubliees` devient
`useNombreDeQuestionsServies`. **Un nom qui désigne un sous-ensemble finit par
produire une phrase d'écran fausse**, et personne ne relit un libellé qui a
toujours été là. Les statistiques disent maintenant « Questions servies » et
« Jamais tirées » : le même mot ne dit plus deux choses à deux lignes d'écart.

### Une conséquence de modèle, à dire clairement

`verrouillee` rejoint `champsSession()`, qui est lu avec `hasAll` : **une séance
composée avant ce lot ne se met plus à jour du tout** — ni lancer, ni mettre en
pause, ni arrêter. C'est la politique écrite de `CLAUDE.md` : la base ne contient
que de la recette, et on ne rend pas un champ facultatif pour ménager des
documents jetables. Elle a un effet visible : la séance `6DWEF6` du 16 septembre,
restée ouverte, occupe `maSessionEnCours` sans pouvoir être close. Elle l'était
déjà probablement avant ce lot — le lot 11 avait rendu `titre`, `animateurNom` et
`ouverteLe` obligatoires de la même façon. `npm run recette:nettoyer` est écrit
pour ce cas.

---

## Le tour complet — fonctionnel 16 : « À revoir » complété

Trois éléments de la maquette 05 manquaient : le bouton « Retravailler » par
ligne, la colonne « Vu mardi », et le sélecteur de tri — le tri était appliqué,
il n'était pas exposé.

### « Retravailler » ne crédite rien, et c'est la décision du lot

**Le bouton promet une question, pas une série.** Il ouvre
`/serie?question=<id>` : l'écran est le même — question, correction,
explication —, et ce qui change est ce qui vient après. **Une révision ne
crédite rien** : ni étoile, ni série terminée, ni jour d'assiduité, ni
récompense. La réponse, elle, compte pleinement : l'état est écrit, la question
sort de « à revoir » si elle est juste, et `questionStats` reçoit sa tentative.

Sans cette règle, le bouton serait une machine à étoiles. Une question juste
vaut cent pour cent, et dix clics vaudraient dix séries.

### Le défaut était déjà là, et il ne venait pas de ce bouton

**« Série de rattrapage » produisait déjà des séries d'une question.**
`tirerRattrapage` ne tire que les questions ratées : quand il n'en reste qu'une,
la série en compte une — et un pourcentage sur une question ne vaut que 0 ou
100. Une seule bonne réponse payait donc **trois étoiles**, autant que dix, et
rien n'empêchait de recommencer.

`etoilesGagnees` mesure désormais sur **une série pleine** :

```ts
const taux = justes / Math.max(total, TAILLE_SERIE);
```

Une question seule vaut 10 %, donc rien. Un rattrapage de huit, parfait, vaut
80 % et deux étoiles : du travail réel, payé au prorata de ce qu'il pesait. Et
**l'écran de fin le dit** quand le tirage est court — « Les étoiles se comptent
sur une série de dix. Celle-ci en comptait trois. » Un zéro sans explication
passe pour une panne.

**Un test verrouillait l'ancien comportement**, sous un nom qui le rendait
défendable : « raisonne en taux, donc vaut aussi pour une série courte ». Il
raisonnait bien en taux, sur un dénominateur qui rétrécissait.

**Conséquence à connaître, et elle est transitoire** : tant que la banque compte
moins de dix questions servies, une série ordinaire est courte elle aussi et
paiera moins. C'est un état de recette, pas un état du produit.

### La date de dernière vue existait déjà

**Rien de nouveau n'est stocké, et rien ne grossit.** `users/{uid}/etats/{id}`
porte `majLe` depuis le lot 5 : écrite par `enregistrerReponse` à chaque
réponse, bornée par les règles (`horodatagePasse`), sur un document qui existe
déjà et qu'on relit déjà en entier. Elle n'était simplement pas remontée par
`chargerMesEtats`. Aucun document de plus, aucune lecture de plus.

**« Vu mardi » n'est honnête qu'une semaine.** Au-delà, « mardi » désigne quatre
mardis et n'apprend plus rien — même défaut que la date d'explication corrigée
au 13. Six jours en arrière au plus, donc, et pas sept : « vu mercredi » un
mercredi désignerait aujourd'hui autant que la semaine dernière. Au-delà, la
date en toutes lettres. Le jour se compte à Paris, comme l'assiduité.

Rien ne s'affiche quand la date manque — un état écrit avant que `majLe` existe.
Une colonne vide vaut mieux qu'un tiret dont personne ne sait ce qu'il dit.

### Le tri, et ce qu'il coûtait de l'exposer

Trois tris, **chacun lisible sur une colonne que l'écran affiche déjà** :
« Erreurs répétées » (le défaut, le tri actuel), « Vues il y a longtemps »,
« Par formation ». Un tri sur une donnée invisible laisse devant une liste qui a
bougé sans qu'on sache pourquoi. Chacun se termine par le même départage,
l'identifiant : sans lui, deux questions à égalité changent de place d'un rendu
à l'autre et la liste saute sous le doigt.

**Et la question posée avait une vraie réponse : oui, ça relisait.**
`useParametresUrl` posait le paramètre par `router.replace`. Changer l'adresse
est une chose ; `router.replace` en fait une autre, qui est une navigation — il
redemande au serveur la charge du segment. Or ces écrans rendent leur
référentiel **au serveur**, par le SDK Admin, puis le passent en propriété à un
composant client dont l'effet dépend de cet objet et relit les états et la
progression dans Firestore. **Cocher un onglet de format rejouait donc la chaîne
complète** — et ce, depuis le lot où les onglets existent.

`window.history.replaceState` change l'adresse **sans** passer par le routeur :
aucune requête, aucun nouveau rendu serveur, et `useSearchParams` se met tout de
même à jour. Next l'intègre explicitement, et **son propre exemple est un
sélecteur de tri** (`docs/01-app/02-guides/single-page-applications.md`).

Ce que cela suppose des pages concernées, et qui est vrai pour les quatre
(`/admin/questions`, `/admin/formations`, `/admin/statistiques`, `/a-revoir`) :
aucune ne lit `searchParams` côté serveur. Une page qui le ferait ne verrait pas
le changement — c'est la seule raison qui justifierait de revenir au routeur.

**Le gain ne se limite pas au nouveau sélecteur** : il vaut pour les onglets de
format, la recherche de la banque, les filtres des statistiques et le bouton
« charger plus », qui passaient tous par là.

### Ce que la maquette mobile ne dessine pas

`MobileReview` réduit la ligne à ce qu'on lit d'un pouce : la forme de la
formation, l'énoncé, le format, le compte d'échecs. **Ni la date, ni
« Retravailler », ni le tri.** Le geste, à cette largeur, est la série de
rattrapage du pied fixe — une action pleine largeur vaut mieux que six petites
empilées, et « Retravailler » a ici une alternative de plein droit sur le même
écran.

`display: none` sous 700 px : les deux restent dans le DOM mais sortent du
rendu **et de l'arbre d'accessibilité**, et il n'y a rien à télécharger — ce
sont un lien et du texte. Ce n'est pas le même geste que le collage de l'écran
de jonction, que React ne rend pas du tout ; les confondre ferait croire à une
économie de réseau qui n'a pas lieu ici. Masqués sur l'enveloppe plutôt que sur
le bouton : `Bouton` pose son `display` en style en ligne, piège qui a déjà
coûté trois fois.

### Ce qui est vérifié par les tests

972 tests, 47 fichiers.

| Ce qui est garanti | Où |
|---|---|
| Une révision n'appelle pas `crediterSerie` | `tests/ecrans/serie.test.tsx` |
| Une révision enregistre bien la réponse | idem |
| Un choix redessine sans que l'adresse du routeur bouge | `tests/navigation/parametres-url.test.tsx` |
| Deux choix successifs se cumulent | idem |
| Filtrer et trier ne naviguent jamais | idem |
| Le retour arrière du navigateur reprend la main | idem |
| « Retravailler » ouvre la question de sa ligne | `tests/ecrans/a-revoir.test.tsx` |
| « Vu … » nomme le jour six jours, date au-delà | `tests/session/revision.test.ts` |
| Le tri départage les égalités de façon stable | idem |
| Une série courte ne paie jamais plus qu'une pleine | `tests/serie/tirage.test.ts` |

### Ce que la recette navigateur a mesuré, et ce qu'elle a trouvé

Écran authentifié, banque de seize questions, serveur de développement. Sonde :
un `PerformanceObserver` sur les entrées `resource` — il voit la charge RSC
comme les appels Firestore, y compris le canal long — remis à zéro avant chaque
geste, avec **témoin au repos à zéro** pour s'assurer qu'on ne compte pas du
bruit de fond.

#### 1. Le compte de requêtes, avant et après

| Geste | `router.replace` | `replaceState` |
|---|---|---|
| Onglet de format (« À revoir ») | **6** — 1 charge RSC, 4 Firestore, 1 police | **0** |
| Sélecteur de tri (« À revoir ») | **4** — 1 charge RSC, 3 Firestore | **0** |
| Trois frappes de recherche (banque) | **10** — 3 charges RSC, 7 Firestore | **7** — 0 charge RSC, 7 Firestore |

**Une charge RSC par frappe, et elle disparaît.** C'est le gain : le rendu
serveur de la page — donc la banque relue par le SDK Admin — ne se rejoue plus.

**Les sept Firestore de la recherche ne viennent pas des frappes, et il fallait
le vérifier plutôt que de les attribuer au changement.** Mesuré : trois frappes
**supplémentaires**, une fois déjà en recherche, coûtent **zéro requête** ;
c'est l'**entrée** en recherche qui en coûte sept, et la sortie six. La clé de
l'effet de chargement porte `enRecherche`, un booléen, pas le texte : Firestore
ne cherchant pas dans un texte, il faut charger une fois l'ensemble filtré. Ce
coût-là est voulu, et il est indépendant du routeur.

#### 2. Le défaut que seul le navigateur pouvait trouver

**`replaceState` change l'adresse et ne redessine rien.** La documentation de
Next annonce que `pushState` et `replaceState` « s'intègrent au routeur » pour
que `usePathname` et `useSearchParams` portent la nouvelle valeur. En 16.3.4,
sur une page dynamique, c'est faux pour `useSearchParams` : **mesuré**,
l'adresse passait à `?format=vf`, l'onglet actif restait « Tous les formats », le
compteur ne bougeait pas, et la liste ne se filtrait plus. Pire, le choix suivant
repartait d'une adresse périmée : `?tri=anciennete` **remplaçait** `?format=qcm`
au lieu de s'y ajouter.

Le filtre était donc cassé, en silence, sur les quatre écrans qui portent
`useParametresUrl`. Les tests d'écran ne pouvaient pas le voir : ils faisaient
dire à `useSearchParams` ce qui les arrangeait.

**La correction.** La valeur courante vit dans un état React, semée depuis
l'adresse — trois sources dans cet ordre : ce que l'écran vient de choisir, ce
qu'une vraie navigation apporte, ce que l'adresse portait au montage. L'adresse
continue d'être écrite par `replaceState`, pour qu'un rechargement retombe sur
la même vue et qu'une recherche se partage par un lien. Les flèches du
navigateur reprennent la main par `popstate`.

`tests/navigation/parametres-url.test.tsx` fait dire au faux ce que fait le vrai
— **une adresse qui ne bouge jamais** — et vérifie qu'un choix redessine quand
même. Sur l'ancienne implémentation, six de ses huit tests tombent.

**La leçon, et elle vaut au-delà d'ici : un faux qui rend ce qui arrange ne
prouve rien.** Celui-ci rendait une adresse mise à jour parce que c'était
commode ; le vrai ne la met pas à jour. Le test passait, l'écran était cassé.

#### 3. La ligne aux largeurs de la maquette

Banc en cadre, l'écran physique plafonnant à 1280.

| Largeur | « Vu … » | « Retravailler » | Filtres et tri | Hauteur de ligne |
|---|---|---|---|---|
| 1440 | colonne de 96 px, alignée à droite | affiché | affichés | 79 px |
| 1024 | 96 px, à droite | affiché | affichés | 113 px |
| 760 | 79 px, **aligné à gauche** — la ligne se replie | affiché | affichés | 117 px |
| 698 | **masqués** | **masqué** | **masqués** | — |
| 390 / 375 | **masqués** | **masqué** | **masqués** | 189 px |

Aucun débordement horizontal à aucune largeur.

**La bascule tombe entre 698 et 699, et ce n'est pas un défaut de la feuille.**
À 699 px, `matchMedia('(max-width: 699px)')` rend `false` alors que
`(max-width: 700px)` rend `true` : l'écran de mesure est à 1,5× de densité, le
cadre de 699 px CSS en vaut 699,33 réels, et la borne retombe du côté bureau. À
698 px tout bascule. Les largeurs de la maquette — 1440, 390, 375 — sont loin de
cette frontière.

#### 4. Le sélecteur de tri

Dépouillé comme la maquette le dessine : `appearance: none`, aucune bordure,
fond transparent, rembourrage nul, graisse 600 à 13 px, chevron du jeu d'icônes
à 15 px. Les trois libellés sont servis par un `select` natif — clavier, lecteur
d'écran et roue crantée du téléphone acquis sans rien réécrire — sous le nom
accessible « Trier les questions à revoir ».

**Le halo de focus se pose bien sur l'enveloppe** : `box-shadow` de 3 px en
`rgba(0,110,144,.14)` et contour de `#006E90` à 2 px de décalage. Le `select`
dépouillé n'ayant plus de cadre à épaissir, sans cela un réglage au clavier
n'aurait eu aucun indicateur visible.

**Une mesure prise trop tôt a d'abord annoncé le contraire** — halo absent —
parce qu'elle lisait les styles dans le même tour que le `focus()`. Une seconde
lecture, isolée, a montré le halo. C'est le même piège que partout ailleurs :
une valeur lue au mauvais moment ressemble exactement à une valeur fausse.

---

## Le tour complet — fonctionnel 17 : les chiffres des formations

La maquette 11 pose deux chiffres sur chaque carte — « 24 questions » et « 92 %
maîtrise équipe » — et un bandeau de pied qui renvoie aux brouillons. L'écran
n'avait aucun des trois.

### Ce qui se calcule, et ce qui ne se calcule pas

**Deux chiffres sur trois.** Le nombre de questions servies et le nombre de
brouillons se comptent. La **maîtrise d'équipe**, non : c'est une moyenne des
maîtrises individuelles, elle demanderait `users/{uid}` et ses réponses, que les
règles ferment à l'administrateur sans exception. Troisième écart de cette
famille, après le bloc « Maîtrise par commercial » de l'écran 09 et l'écran 06b
tout entier. Noté comme tel dans « En attente — non tranché », avec sa raison.

**Ce qui prend sa place est le chiffre actionnable.** Un taux d'équipe ne se
regarde pas sans se comparer ; un nombre de brouillons mène à un geste —
publier — et le bandeau le pose à un clic.

### Deux comptages, deux stratégies opposées, et c'est la population qui décide

**Les questions servies : une agrégation par formation.**
`getCountFromServer` coûte **une unité de lecture par requête**, quel que soit
le nombre de questions comptées. Soixante formations valent soixante unités.
L'alternative — lire toutes les questions et compter en mémoire — en coûterait
deux cents et téléchargerait l'énoncé, l'explication et l'argumentaire de
chacune sur un écran qui ne les affiche pas. C'est la règle de `CLAUDE.md` : ce
qu'un écran ne peint pas, il ne doit pas le télécharger.

**Les brouillons : une seule lecture pour toute la banque.** Raisonnement
inverse, parce que la population l'est : les brouillons sont le petit bout de la
collection — ce qui n'est pas encore sorti. Les lire une fois coûte moins que
soixante agrégations, et donne en prime **quelles** formations en portent, ce
qu'un compte global ne dirait pas. Si cette lecture venait à peser, c'est qu'il y
aurait un autre problème : une banque à moitié publiée.

### Ce que la mesure a corrigé, deux fois

**La borne de parallélisme a été mesurée, pas devinée.** Par vagues de huit, les
soixante chiffres d'une page mettaient **huit secondes** à se poser. Firestore
répond en HTTP/2, qui multiplexe sur une seule connexion : la limite de six
requêtes par hôte du HTTP/1.1, qui justifiait la prudence, ne s'applique pas.
Par vagues de vingt-quatre, **cinq secondes**, trois mesures concordantes. La
borne reste, pour que la liste elle-même ne se retrouve pas derrière une file de
soixante requêtes.

**Et la recherche recomptait ce qui l'était déjà.** `visibles` change à chaque
frappe — elle filtre une liste déjà en mémoire —, et l'effet repartait sur
l'ensemble visible. Même famille que le défaut du 16, trouvée par la même sonde.
L'effet ne demande plus que les formations dont le compte manque. **Mesuré :
trois frappes qui ne font que rétrécir la liste coûtent zéro requête** ; celles
qui l'élargissent ne paient que les formations vues pour la première fois.

Une synchronisation Airtable, elle, remet les comptes à zéro : elle change la
banque autant que le référentiel.

### Ce que la recette a mesuré

Écran réel, 179 formations dont 162 au catalogue, 60 cartes à la première page.

| Mesure | Valeur |
|---|---|
| Requêtes Firestore au chargement | 72 — 60 agrégations, 1 lecture des brouillons, 11 pour la liste et les compteurs de coquille |
| Premier chiffre posé | ~3,0 s |
| Les soixante chiffres posés | ~5,1 s (8,0 s par vagues de huit) |
| Trois frappes qui rétrécissent la recherche | **0 requête** |
| Bandeau | « 2 questions sont encore en brouillon », lien `/admin/questions?statut=brouillon` |

**Les cartes ne sont jamais en attente d'un chiffre** : elles s'affichent, les
nombres se posent dessus. Et **rien ne s'affiche tant que le compte n'est pas
arrivé** — un zéro posé par défaut se lirait « cette formation n'a aucune
question », ce qui est une tout autre nouvelle. Une formation dont l'agrégation
échoue garde sa carte, sans chiffre.

---

## Ce que Claude Code doit faire des écrans en attente

Ne pas les implémenter. Ne pas les contourner. Ne pas produire de version approximative « en attendant ».

Si un écran en attente est nécessaire à la cohérence d'un écran validé — par exemple si l'accueil comporte un bouton menant à « Choisir sa série » — le signaler et proposer le comportement minimal conforme à ce qui est décidé, sans inventer la fonctionnalité.

Les maquettes restent lisibles et servent de référence visuelle. Elles ne valent pas décision de produit.
