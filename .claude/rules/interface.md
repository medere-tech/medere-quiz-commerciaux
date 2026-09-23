---
paths:
  - "src/app/**/*.tsx"
  - "src/composants/**/*.tsx"
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

## Vérifier ce qu'on voit, et non ce qui existe

Chercher un nœud, lire son texte, vérifier son rôle : aucune de ces trois
vérifications ne touche à la mise en page. jsdom et happy-dom n'en font aucune.
**Un test d'écran ne verra jamais un chevauchement.**

Le piège s'est refermé trois fois — deux barres collantes, puis une
confirmation dont les trois libellés, écrits dans une colonne large de deux
icônes avec `white-space: nowrap`, se sont superposés. À chaque fois les nœuds
étaient corrects, et à chaque fois l'écran était cassé.

### Le détecteur de chevauchement

À passer dans la console du navigateur, ou via un outil d'automatisation, sur
le conteneur qu'on soupçonne. Il compare les rectangles des **frères** : deux
enfants d'une même boîte qui s'intersectent sont, sauf superposition voulue, un
défaut visible.

```js
const chevauchements = (racine) => {
  const enfants = [...racine.children].filter((e) => e.getBoundingClientRect().width > 0);
  const trouves = [];
  for (let i = 0; i < enfants.length; i++) {
    for (let j = i + 1; j < enfants.length; j++) {
      const a = enfants[i].getBoundingClientRect();
      const b = enfants[j].getBoundingClientRect();
      if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) {
        trouves.push([enfants[i], enfants[j]]);
      }
    }
  }
  return trouves;
};
```

Deux précautions pour qu'il serve :

- Il ne juge que des **frères**. Un enfant qui recouvre son parent est normal ;
  deux frères qui se recouvrent, presque jamais.
- Un **voile** de panneau superposé recouvre tout par construction : ses
  intersections sont le fonctionnement, pas le défaut. Les écarter, ou mesurer
  panneau fermé.

### Le complément, qui attrape ce que le chevauchement laisse passer

Comparer la **somme des largeurs des enfants** à celle du conteneur. Trois
commandes de 24 px et deux interstices de 4 font 80 ; une colonne déclarée à 64
est fausse avant qu'on regarde. C'est un calcul, il tient dans une assertion.

### Et le reste se regarde

Un collant se vérifie en défilant : mesurer sa position avant et après un
défilement complet, à chaque largeur de la maquette. « Le nœud est là » et « la
personne le voit » sont deux énoncés différents ; le second ne se déduit jamais
du premier.
