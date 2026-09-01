---
paths:
  - "src/app/**/*.tsx"
  - "src/components/**/*.tsx"
  - "src/**/*.css"
---

# Interface

Le design est fourni par Claude Design. S'y conformer, ainsi qu'à ses tokens. Ne pas substituer une autre palette, typographie ou bibliothèque de composants. Si un cas n'est pas couvert par les maquettes, le signaler plutôt que d'improviser.

## Interdits fermes

- **Aucun emoji**, nulle part, y compris pour les récompenses et les états de réussite ou d'échec.
- Un **seul jeu d'icônes** vectorielles, trait régulier, tailles issues d'une échelle. Ne jamais mélanger deux familles. Ne jamais employer un caractère typographique comme icône.
- **Aucune bordure sur un seul côté** : pas de filet vertical à gauche d'un bloc, pas de soulignement d'onglet actif, pas de trait sous chaque ligne de liste. Distinguer par le fond, l'espacement ou une bordure complète.
- Pas de libellé en majuscules au-dessus des titres, pas de flèche ajoutée au texte des boutons, pas de dégradé décoratif.

## Contenu

Français, vouvoiement, verbes actifs, phrases courtes. Vocabulaire métier : formation, professionnel de santé, e-learning, classe virtuelle, présentiel, argumentaire.

Un bouton dit ce qui va se produire. Une action garde le même nom d'un bout à l'autre du parcours.

Les états vides, les erreurs et les chargements sont des écrans à part entière. Un écran vide invite à agir. Une erreur dit ce qui s'est passé et quoi faire, elle ne s'excuse pas.

## Qualité

Navigation clavier complète avec focus visible sur le parcours d'entraînement. `prefers-reduced-motion` respecté. Lisible jusqu'à 375 pixels. Ni `localStorage` ni `sessionStorage`.
