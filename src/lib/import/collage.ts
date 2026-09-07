import { associerColonnes, COLONNES, type Colonne } from '@/lib/import/colonnes';
import { decouperTableau, type LigneTableau, type NomSeparateur } from '@/lib/import/tableau';
import type { LigneImport } from '@/lib/import/lignes';

/**
 * Du tableau brut aux lignes nommées.
 *
 * **Le point de convergence est la grille, pas le texte.** Trois entrées
 * mènent ici — un collage, un CSV déposé, une feuille de classeur — et elles
 * se rejoignent sur `lireGrille`, une fois qu'elles ont produit un en-tête et
 * des lignes de cellules. Faire converger sur du texte obligerait le classeur
 * à se resérialiser en CSV pour être aussitôt redécoupé : un aller-retour qui
 * ne peut qu'introduire des différences là où on cherche l'inverse.
 *
 * Le seul endroit où l'import échoue en bloc : quand l'en-tête ne dit pas ce
 * que contiennent les colonnes, aucune ligne n'est lisible, et il n'y a rien
 * à importer partiellement. Passé ce point, chaque ligne vit sa vie.
 */

/** D'où viennent les lignes, pour le dire à l'écran. */
export type Provenance =
  | { forme: 'texte'; separateur: NomSeparateur }
  | { forme: 'classeur'; feuille: string };

export type ResultatCollage =
  | { etat: 'vide' }
  | { etat: 'entete-illisible'; manquantes: Colonne[]; entetes: string[] }
  | {
      etat: 'lu';
      provenance: Provenance;
      lignes: LigneImport[];
      /** En-têtes non reconnus : lus, puis laissés de côté. */
      ignorees: string[];
    };

export function lireGrille(
  entetes: string[],
  lignes: LigneTableau[],
  provenance: Provenance,
): ResultatCollage {
  const association = associerColonnes(entetes);

  if (association.manquantes.length > 0) {
    return { etat: 'entete-illisible', manquantes: association.manquantes, entetes };
  }

  const nommees: LigneImport[] = lignes.map((ligne) => {
    const valeurs = Object.fromEntries(
      COLONNES.map((colonne) => {
        const position = association.index[colonne];
        // Colonne absente du tableau, ou ligne plus courte que l'en-tête :
        // la valeur est vide, jamais absente. Le modèle ne connaît pas `null`.
        return [colonne, position === undefined ? '' : (ligne.cellules[position] ?? '')];
      }),
    ) as Record<Colonne, string>;

    return { numero: ligne.numero, valeurs };
  });

  return { etat: 'lu', provenance, lignes: nommees, ignorees: association.ignorees };
}

export function lireCollage(texte: string): ResultatCollage {
  if (texte.trim().length === 0) return { etat: 'vide' };

  const tableau = decouperTableau(texte);
  if (!tableau) return { etat: 'vide' };

  return lireGrille(tableau.entetes, tableau.lignes, {
    forme: 'texte',
    separateur: tableau.separateur,
  });
}

/**
 * Une feuille de classeur, déjà réduite à des chaînes par la lecture du
 * fichier. La première ligne est l'en-tête, comme partout ailleurs.
 */
export function lireFeuille(nomFeuille: string, cellules: string[][]): ResultatCollage {
  const nonVides = cellules
    .map((ligne, position) => ({ position, ligne }))
    .filter(({ ligne }) => ligne.some((cellule) => cellule.trim().length > 0));

  const entete = nonVides[0];
  if (!entete) return { etat: 'vide' };

  return lireGrille(
    entete.ligne.map((cellule) => cellule.trim()),
    nonVides.slice(1).map(({ position, ligne }) => ({
      // Le numéro est celui de la ligne dans la feuille, tel qu'Excel
      // l'affiche dans sa gouttière : c'est là que Noémie ira corriger.
      numero: position + 1,
      cellules: ligne.map((cellule) => cellule.trim()),
    })),
    { forme: 'classeur', feuille: nomFeuille },
  );
}
