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
| 5 · Mobile | Les mêmes écrans en mobile | Lot 5 |
| 3 · Reprendre, approfondir, animer | À revoir, statistiques, formats VF et scénario, session collective | Lots 5, 6 et 7 |

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
| 10a · Session collective, côté commercial | 3 | 7 |
| 10b · Session collective, côté animateur | 3 | 7 |

### Tranché au lot 7

| Écran | Ce qui a été décidé |
|---|---|
| **04b · Récompenses et équipe** | **Construit, au lot 7, sous une forme qui lève la contradiction relevée au tri.** L'objection tenait : un classement permanent entre commerciaux transforme un outil d'apprentissage en outil d'évaluation, et les scores d'entraînement restent privés. La séance collective est le seul contexte où le classement ne contredit rien — **ils étaient dans la même pièce et se sont vus répondre**. D'où la coupure : le **classement** est nominatif, il vit dans la séance et n'est lisible que par ceux qui y étaient, présence vérifiée par les règles ; le **prix** est privé, durable, et ne s'agrège à rien. Le tableau meurt avec la séance, le trophée reste. Rien ne remonte dans `questionStats`, et il n'existe nulle part de classement entre commerciaux hors d'une séance vécue ensemble. Chacun choisit le nom sous lequel il apparaît, borné à 32 caractères parce qu'il s'affiche sur un écran projeté. |

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
| **09 · Onglets de période (7 jours / 30 jours)** | 3 | `questionStats` est un cumul depuis la mise en service : deux compteurs et une date de dernière écriture, sans découpage dans le temps. Afficher « 7 jours » rendrait le total présent sous une étiquette fausse. Les construire suppose que la Cloud Function écrive aussi des compteurs par période — décision de modèle, à prendre avant d'être codée. |
| **09 · Carte « Session du jeudi »** | 3 | Encadré sombre annonçant que les quatre questions les plus ratées composent la série collective, avec un bouton « Préparer la session ». Dépend du lot 7, qui n'existe pas : un bouton vers un écran absent vaut moins que pas de bouton. À reprendre au lot 7, où il trouve sa cible. |
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
- `Médéré Entraînement 5 - mobile.html`
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
- `screens-mobile.jsx`
- `ui.jsx`
Implement: `Médéré Entraînement 5 - mobile.html`
```

Contient : **00 · Rappel du jour (EN ATTENTE)** · 01 · Accueil · 02 · Question, choix multiples · 03 · Correction · 04 · Fin de série · 05 · À revoir.

### Prompt 3 — Reprendre, approfondir, animer
*Lots 5, 6 et 7. À importer au lot 5, puis relire aux lots 6 et 7.*

```
Use the claude_design MCP (https://api.anthropic.com/v1/design/mcp, auth via /design-login) to import this project:
https://claude.ai/design/p/6ed08356-56e4-4a06-ab31-037cb1ea59a1?file=M%C3%A9d%C3%A9r%C3%A9+Entra%C3%AEnement+3+-+reprendre%2C+approfondir%2C+animer.html
Focus on these files (the whole project is readable):
- `Médéré Entraînement 3 - reprendre, approfondir, animer.html`
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
Implement: `Médéré Entraînement 3 - reprendre, approfondir, animer.html`
```

Contient : 05 · Questions à revoir · 09 · Statistiques · Format · Vrai ou faux · Format · Mise en situation · **06b · Détail d'une formation (EN ATTENTE)** · 10a · Session collective, côté commercial · 10b · Session collective, côté animateur.

---

## Ce que Claude Code doit faire des écrans en attente

Ne pas les implémenter. Ne pas les contourner. Ne pas produire de version approximative « en attendant ».

Si un écran en attente est nécessaire à la cohérence d'un écran validé — par exemple si l'accueil comporte un bouton menant à « Choisir sa série » — le signaler et proposer le comportement minimal conforme à ce qui est décidé, sans inventer la fonctionnalité.

Les maquettes restent lisibles et servent de référence visuelle. Elles ne valent pas décision de produit.
