/**
 * Lecture d'un fichier déposé.
 *
 * **Deux sorties, un seul analyseur derrière.** Un fichier texte donne du
 * texte, un classeur donne des feuilles de cellules. Les deux rejoignent
 * `lireGrille` : le classeur ne se resérialise pas en CSV pour être aussitôt
 * redécoupé.
 *
 * **L'encodage est le piège des fichiers texte.** Excel écrit ses CSV en
 * UTF-8 avec marqueur d'ordre des octets, qui colle au premier en-tête et le
 * rend méconnaissable — le décodeur et le découpage l'enlèvent tous deux. Et
 * « Enregistrer sous CSV » tout court, sur un Windows français, produit du
 * Windows-1252 : lu comme de l'UTF-8, chaque accent devient un losange. On
 * tente donc l'UTF-8 strict, et on retombe sur Windows-1252 plutôt que de
 * rendre du charabia.
 *
 * **La bibliothèque de classeurs se charge à la demande.** `read-excel-file`
 * pèse plus que tout le reste de l'écran ; l'immense majorité des imports
 * n'en aura jamais besoin. Elle n'est demandée qu'au moment où un classeur
 * est effectivement déposé.
 */

export type Encodage = 'utf-8' | 'windows-1252';

/** Une feuille de classeur, réduite à des chaînes. */
export type FeuilleClasseur = { nom: string; cellules: string[][] };

export type ResultatFichier =
  | { etat: 'texte'; nom: string; texte: string; encodage: Encodage }
  | { etat: 'classeur'; nom: string; feuilles: FeuilleClasseur[] }
  | { etat: 'refuse'; message: string };

/** Fichiers texte : le tableur les exporte tous. */
export const EXTENSIONS_TEXTE = ['.csv', '.tsv', '.tab', '.txt'] as const;

/** Classeurs lus directement, sans passer par un export. */
export const EXTENSIONS_CLASSEUR = ['.xlsx'] as const;

export const EXTENSIONS_ACCEPTEES = [...EXTENSIONS_TEXTE, ...EXTENSIONS_CLASSEUR] as const;

/** Attribut `accept` du sélecteur de fichier, dérivé de la même liste. */
export const ACCEPT_FICHIER = [
  ...EXTENSIONS_ACCEPTEES,
  'text/csv',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
].join(',');

/**
 * Un tableau de questions pèse quelques dizaines de kilo-octets. Au-delà de
 * cinq mégaoctets, ce n'est plus un tableau : c'est un classeur avec des
 * images, ou le mauvais fichier.
 */
export const TAILLE_MAXIMALE = 5 * 1024 * 1024;

function extension(nom: string): string {
  const point = nom.lastIndexOf('.');
  return point === -1 ? '' : nom.slice(point).toLowerCase();
}

/** Un .xlsx, un .docx ou un .zip commencent tous par la signature ZIP. */
export function estArchive(octets: Uint8Array): boolean {
  return octets[0] === 0x50 && octets[1] === 0x4b;
}

export function decoder(octets: Uint8Array): { texte: string; encodage: Encodage } {
  try {
    // En mode strict, un octet invalide lève au lieu de produire un losange :
    // c'est exactement le signal qu'on cherche.
    const texte = new TextDecoder('utf-8', { fatal: true }).decode(octets);
    return { texte, encodage: 'utf-8' };
  } catch {
    return {
      texte: new TextDecoder('windows-1252').decode(octets),
      encodage: 'windows-1252',
    };
  }
}

/**
 * Une cellule de classeur n'est pas forcément une chaîne : Excel rend des
 * nombres, des dates, et des booléens dès qu'on tape VRAI ou FAUX — ce que
 * Noémie fera dans la colonne « bonne réponse » d'un vrai ou faux. Les rendre
 * en « true » et « false » y casserait la correspondance avec les options.
 */
export function celluleEnTexte(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return '';
  if (typeof valeur === 'boolean') return valeur ? 'Vrai' : 'Faux';
  if (valeur instanceof Date) return valeur.toISOString().slice(0, 10);
  return String(valeur);
}

/** Ce qui se décide sans lire le contenu : taille, nature, extension. */
export type Verdict =
  | { sorte: 'texte' }
  | { sorte: 'classeur' }
  | { sorte: 'refuse'; message: string };

export function examiner(nom: string, octets: Uint8Array): Verdict {
  if (octets.length === 0) {
    return { sorte: 'refuse', message: `« ${nom} » est vide.` };
  }

  if (octets.length > TAILLE_MAXIMALE) {
    const mega = (octets.length / (1024 * 1024)).toFixed(1);
    return {
      sorte: 'refuse',
      message:
        `« ${nom} » fait ${mega} Mo, le maximum est ${TAILLE_MAXIMALE / (1024 * 1024)} Mo. ` +
        `Un tableau de questions dépasse rarement quelques centaines de kilo-octets.`,
    };
  }

  const suffixe = extension(nom);

  // Le vieux format binaire d'Excel n'est pas un classeur XML : aucune
  // bibliothèque raisonnable ne le lit, autant le dire tout de suite.
  if (suffixe === '.xls') {
    return {
      sorte: 'refuse',
      message:
        `« ${nom} » est au vieux format Excel (.xls). ` +
        `Ouvrez-le, puis « Enregistrer sous » au format .xlsx, et redéposez-le.`,
    };
  }

  // Le classeur est reconnu sur son contenu autant que sur son nom : un .csv
  // renommé depuis un .xlsx donnerait sinon une page de caractères illisibles.
  if (suffixe === '.xlsx' || estArchive(octets)) return { sorte: 'classeur' };

  if (!EXTENSIONS_TEXTE.includes(suffixe as (typeof EXTENSIONS_TEXTE)[number])) {
    return {
      sorte: 'refuse',
      message:
        `« ${nom} » n'est pas un tableau${suffixe ? ` (${suffixe})` : ''}. ` +
        `Déposez un fichier ${EXTENSIONS_ACCEPTEES.join(', ')}.`,
    };
  }

  return { sorte: 'texte' };
}

/** Partie pure du chemin texte : c'est elle que les tests exercent. */
export function analyserTexte(nom: string, octets: Uint8Array): ResultatFichier {
  const { texte, encodage } = decoder(octets);

  if (texte.trim().length === 0) {
    return { etat: 'refuse', message: `« ${nom} » ne contient aucune ligne.` };
  }

  return { etat: 'texte', nom, texte, encodage };
}

async function lireClasseur(nom: string, octets: Uint8Array): Promise<ResultatFichier> {
  // Chargement à la demande : la bibliothèque n'entre dans le navigateur que
  // le jour où un classeur est déposé.
  const { default: lireXlsx } = await import('read-excel-file/browser');

  // La copie détache les octets du tampon d'origine : la bibliothèque prend
  // un ArrayBuffer, et celui d'un Uint8Array peut être plus grand que lui.
  const tampon = octets.slice().buffer as ArrayBuffer;
  const feuilles = await lireXlsx(tampon, { trim: true });

  const utiles: FeuilleClasseur[] = feuilles.map((feuille) => ({
    nom: feuille.sheet,
    cellules: feuille.data.map((ligne) => ligne.map(celluleEnTexte)),
  }));

  if (utiles.length === 0) {
    return { etat: 'refuse', message: `« ${nom} » ne contient aucune feuille.` };
  }

  return { etat: 'classeur', nom, feuilles: utiles };
}

export async function lireFichier(fichier: File): Promise<ResultatFichier> {
  let octets: Uint8Array;

  try {
    octets = new Uint8Array(await fichier.arrayBuffer());
  } catch {
    return {
      etat: 'refuse',
      message:
        `« ${fichier.name} » n'a pas pu être lu. ` +
        `Vérifiez qu'il n'est pas ouvert dans un autre logiciel, puis réessayez.`,
    };
  }

  const verdict = examiner(fichier.name, octets);

  if (verdict.sorte === 'refuse') return { etat: 'refuse', message: verdict.message };
  if (verdict.sorte === 'texte') return analyserTexte(fichier.name, octets);

  try {
    return await lireClasseur(fichier.name, octets);
  } catch {
    return {
      etat: 'refuse',
      message:
        `« ${fichier.name} » n'a pas pu être ouvert comme classeur. ` +
        `S'il est protégé par mot de passe, retirez la protection ; sinon, ` +
        `exportez-le en CSV et redéposez-le.`,
    };
  }
}
