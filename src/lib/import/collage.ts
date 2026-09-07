import { associerColonnes, COLONNES, type Colonne } from '@/lib/import/colonnes';
import { decouperTableau, type NomSeparateur } from '@/lib/import/tableau';
import type { LigneImport } from '@/lib/import/lignes';

/**
 * Du texte collé aux lignes nommées.
 *
 * Le seul endroit où l'import peut échouer en bloc : quand l'en-tête ne dit
 * pas ce que contiennent les colonnes, aucune ligne n'est lisible, et il n'y
 * a rien à importer partiellement. Passé ce point, chaque ligne vit sa vie —
 * une mauvaise ne retient plus les autres.
 */

export type ResultatCollage =
  | { etat: 'vide' }
  | { etat: 'entete-illisible'; manquantes: Colonne[]; entetes: string[] }
  | {
      etat: 'lu';
      separateur: NomSeparateur;
      lignes: LigneImport[];
      /** En-têtes non reconnus : lus, puis laissés de côté. */
      ignorees: string[];
    };

export function lireCollage(texte: string): ResultatCollage {
  if (texte.trim().length === 0) return { etat: 'vide' };

  const tableau = decouperTableau(texte);
  if (!tableau) return { etat: 'vide' };

  const association = associerColonnes(tableau.entetes);

  if (association.manquantes.length > 0) {
    return {
      etat: 'entete-illisible',
      manquantes: association.manquantes,
      entetes: tableau.entetes,
    };
  }

  const lignes: LigneImport[] = tableau.lignes.map((ligne) => {
    const valeurs = Object.fromEntries(
      COLONNES.map((colonne) => {
        const position = association.index[colonne];
        // Colonne absente du collage, ou ligne plus courte que l'en-tête :
        // la valeur est vide, jamais absente. Le modèle ne connaît pas `null`.
        return [colonne, position === undefined ? '' : (ligne.cellules[position] ?? '')];
      }),
    ) as Record<Colonne, string>;

    return { numero: ligne.numero, valeurs };
  });

  return {
    etat: 'lu',
    separateur: tableau.separateur,
    lignes,
    ignorees: association.ignorees,
  };
}
