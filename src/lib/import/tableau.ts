/**
 * Découpage d'un tableau collé : tabulations ou CSV.
 *
 * **Ce que ce fichier fait, et ce qu'il ne fait pas.** Il découpe du texte en
 * cellules, rien d'autre. Il ne connaît ni les colonnes attendues, ni le
 * modèle d'une question, ni ce qui est valide. Cette séparation est le seul
 * moyen de tester le découpage sur les cas tordus — guillemets, retours à la
 * ligne dans une cellule, séparateur ambigu — sans traîner tout le modèle.
 *
 * **Les trois provenances réelles.** Noémie colle depuis un tableur (Excel,
 * Google Sheets : tabulations), depuis un export CSV (virgules, ou
 * points-virgules quand Excel est en français), ou depuis une réponse d'IA
 * qui produit l'un ou l'autre. Le séparateur se devine, il ne se demande pas :
 * poser la question à l'utilisatrice serait lui faire faire le travail de la
 * machine.
 *
 * **Les guillemets valent pour les trois.** Un tableur qui copie une cellule
 * contenant une tabulation, un retour à la ligne ou un guillemet l'entoure de
 * guillemets et double ceux qu'elle contient — y compris en TSV. Un analyseur
 * qui découperait bêtement sur le séparateur casserait ces cellules-là, et ce
 * sont justement les longues : énoncés, explications, contextes.
 */

export type LigneTableau = {
  /**
   * Numéro affiché à l'utilisatrice, tel qu'il apparaîtrait dans son tableur :
   * l'en-tête est la ligne 1, la première question la ligne 2. Compter les
   * lignes de données à partir de 1 obligerait à faire la conversion de tête
   * en revenant à la source.
   */
  numero: number;
  cellules: string[];
};

export type TableauDecoupe = {
  separateur: 'tabulation' | 'virgule' | 'point-virgule';
  entetes: string[];
  lignes: LigneTableau[];
};

const SEPARATEURS = {
  tabulation: '\t',
  virgule: ',',
  'point-virgule': ';',
} as const;

export type NomSeparateur = keyof typeof SEPARATEURS;

/**
 * Choix du séparateur, sur la première ligne non vide.
 *
 * La tabulation l'emporte dès qu'elle apparaît : aucun texte rédigé n'en
 * contient, alors que virgules et points-virgules abondent dans une phrase
 * française. Entre les deux autres, on prend le plus fréquent, et la virgule
 * en cas d'égalité — y compris quand aucun des deux n'apparaît, cas d'une
 * seule colonne où le choix n'a aucune conséquence.
 */
export function devinerSeparateur(texte: string): NomSeparateur {
  const premiere = texte.split(/\r?\n/).find((ligne) => ligne.trim().length > 0) ?? '';

  if (premiere.includes('\t')) return 'tabulation';

  const virgules = compterHorsGuillemets(premiere, ',');
  const pointsVirgules = compterHorsGuillemets(premiere, ';');

  return pointsVirgules > virgules ? 'point-virgule' : 'virgule';
}

function compterHorsGuillemets(ligne: string, caractere: string): number {
  let dansGuillemets = false;
  let total = 0;

  for (const lettre of ligne) {
    if (lettre === '"') dansGuillemets = !dansGuillemets;
    else if (lettre === caractere && !dansGuillemets) total += 1;
  }

  return total;
}

/**
 * Découpage complet, guillemets compris.
 *
 * Écrit à la main plutôt qu'en expression régulière : une cellule peut
 * contenir un retour à la ligne, ce qui interdit de découper d'abord en
 * lignes puis en cellules. Le parcours se fait caractère par caractère, une
 * seule fois.
 */
function decouper(texte: string, separateur: string): string[][] {
  const lignes: string[][] = [];
  let cellules: string[] = [];
  let cellule = '';
  let dansGuillemets = false;

  // Le marqueur d'ordre des octets ouvre les CSV exportés par Excel. Laissé
  // en place, il colle au premier en-tête et le rend méconnaissable.
  const source = texte.replace(/^﻿/, '');

  const finirCellule = () => {
    cellules.push(cellule);
    cellule = '';
  };

  const finirLigne = () => {
    finirCellule();
    lignes.push(cellules);
    cellules = [];
  };

  for (let index = 0; index < source.length; index += 1) {
    const lettre = source[index];

    if (dansGuillemets) {
      if (lettre === '"') {
        // Deux guillemets de suite : un guillemet littéral dans la cellule.
        if (source[index + 1] === '"') {
          cellule += '"';
          index += 1;
        } else {
          dansGuillemets = false;
        }
      } else {
        cellule += lettre;
      }
      continue;
    }

    if (lettre === '"' && cellule.length === 0) {
      dansGuillemets = true;
    } else if (lettre === separateur) {
      finirCellule();
    } else if (lettre === '\r') {
      // Fin de ligne Windows : le saut suivant fait le travail.
      if (source[index + 1] === '\n') continue;
      finirLigne();
    } else if (lettre === '\n') {
      finirLigne();
    } else {
      cellule += lettre;
    }
  }

  // Un fichier qui ne finit pas par un saut de ligne a quand même une
  // dernière ligne.
  if (cellule.length > 0 || cellules.length > 0) finirLigne();

  return lignes;
}

function ligneVide(cellules: string[]): boolean {
  return cellules.every((cellule) => cellule.trim().length === 0);
}

/**
 * @returns `null` quand le texte ne contient aucune ligne exploitable —
 *   l'appelant décide de ce qu'il en dit, ce n'est pas une erreur d'analyse.
 */
export function decouperTableau(texte: string): TableauDecoupe | null {
  const separateur = devinerSeparateur(texte);
  const brutes = decouper(texte, SEPARATEURS[separateur]);

  // Les lignes vides sont écartées, jamais renumérotées : le numéro annoncé
  // doit être celui qu'on lit dans le tableur, sans quoi Noémie cherche la
  // ligne 7 alors que l'erreur est à la 9.
  const positionEntete = brutes.findIndex((cellules) => !ligneVide(cellules));
  if (positionEntete === -1) return null;

  const entetes = (brutes[positionEntete] ?? []).map((cellule) => cellule.trim());

  const lignes: LigneTableau[] = [];
  for (let position = positionEntete + 1; position < brutes.length; position += 1) {
    const cellules = brutes[position] ?? [];
    if (ligneVide(cellules)) continue;
    lignes.push({
      numero: position + 1,
      // Une cellule vide vaut la chaîne vide, jamais `null` : le modèle ne
      // connaît pas l'absence de valeur, seulement le vide.
      cellules: cellules.map((cellule) => cellule.trim()),
    });
  }

  return { separateur, entetes, lignes };
}
