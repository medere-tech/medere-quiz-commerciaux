/**
 * Écriture d'un classeur `.xlsx`, sans bibliothèque.
 *
 * **Pourquoi à la main.** Le modèle téléchargeable a besoin de trois choses :
 * plusieurs feuilles, du texte, et des listes déroulantes sur quelques
 * colonnes. La bibliothèque qui sait tout faire — `exceljs` — pèse vingt et un
 * mégaoctets, traîne une archive, un décompresseur et un gestionnaire de
 * fichiers temporaires, et n'a plus bougé depuis 2023. `write-excel-file` ne
 * sait pas poser de liste déroulante. Or un `.xlsx` n'est qu'une archive zip
 * de quelques fichiers XML : ce qu'on en utilise tient ici.
 *
 * **Ce que ce module ne fait pas.** Ni formules, ni dates, ni nombres : toute
 * cellule est du texte. C'est voulu — un numéro d'action DPC relu comme un
 * nombre perdrait ses zéros de tête.
 *
 * **La preuve qu'il est lisible** n'est pas dans ce fichier : les tests
 * relisent ce qu'il écrit avec `read-excel-file`, la bibliothèque même que
 * l'écran d'import emploie pour lire un classeur déposé.
 */

export type ListeDeroulante = {
  /** Colonne visée, de 0 à n. */
  colonne: number;
  valeurs: readonly string[];
  /** Ce qu'affiche le tableur quand on tape une valeur hors liste. */
  message: string;
};

export type Feuille = {
  nom: string;
  /** La première ligne est l'en-tête : elle est figée et mise en gras. */
  lignes: string[][];
  /** Largeur de chaque colonne, en caractères. */
  largeurs?: number[];
  /**
   * Listes proposées sous l'en-tête. Elles **avertissent** sans refuser :
   * l'import accepte plus de formes que la liste n'en montre — « vf »,
   * « 2 », un angle hors des cinq —, et le tableur ne doit pas être plus
   * sévère que lui.
   */
  listes?: ListeDeroulante[];
};

/** Lignes couvertes par une liste déroulante : bien au-delà d'un lot réel. */
const LIGNES_COUVERTES = 1000;

// --- XML ---------------------------------------------------------------------

function echapper(texte: string): string {
  return texte
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Les caractères de contrôle sont interdits en XML 1.0, tabulation et
    // retours à la ligne exceptés. Un seul suffirait à rendre le fichier
    // illisible pour Excel.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

/** A, B, …, Z, AA, AB… */
function lettreColonne(index: number): string {
  let reste = index + 1;
  let lettres = '';
  while (reste > 0) {
    const unite = (reste - 1) % 26;
    lettres = String.fromCharCode(65 + unite) + lettres;
    reste = Math.floor((reste - 1) / 26);
  }
  return lettres;
}

const ENTETE_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const ESPACE_TABLEUR = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const ESPACE_RELATIONS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function xmlFeuille(feuille: Feuille, premiere: boolean, chaines: Map<string, number>): string {
  const indexChaine = (texte: string) => {
    let index = chaines.get(texte);
    if (index === undefined) {
      index = chaines.size;
      chaines.set(texte, index);
    }
    return index;
  };

  const lignes = feuille.lignes
    .map((cellules, rangee) => {
      const contenu = cellules
        .map((valeur, colonne) => {
          if (valeur.length === 0) return '';
          const style = rangee === 0 ? ' s="1"' : ' s="2"';
          return `<c r="${lettreColonne(colonne)}${rangee + 1}" t="s"${style}><v>${indexChaine(valeur)}</v></c>`;
        })
        .join('');
      return `<row r="${rangee + 1}">${contenu}</row>`;
    })
    .join('');

  const colonnes = feuille.largeurs?.length
    ? `<cols>${feuille.largeurs
        .map(
          (largeur, index) =>
            // Le style texte vaut pour la colonne entière, cellules vides
            // comprises : ce que Noémie y tapera restera du texte.
            `<col min="${index + 1}" max="${index + 1}" width="${largeur}" style="2" customWidth="1"/>`,
        )
        .join('')}</cols>`
    : '';

  const listes = feuille.listes?.length
    ? `<dataValidations count="${feuille.listes.length}">${feuille.listes
        .map((liste) => {
          const lettre = lettreColonne(liste.colonne);
          // Une liste en ligne se sépare par des virgules et ne dépasse pas
          // deux cent cinquante-cinq caractères. Les valeurs d'ici en sont
          // loin, et aucune ne contient de virgule — le test le vérifie.
          const formule = `"${liste.valeurs.join(',')}"`;
          return (
            `<dataValidation type="list" errorStyle="warning" allowBlank="1" ` +
            `showErrorMessage="1" errorTitle="Valeur hors liste" error="${echapper(liste.message)}" ` +
            `sqref="${lettre}2:${lettre}${LIGNES_COUVERTES}"><formula1>${echapper(formule)}</formula1></dataValidation>`
          );
        })
        .join('')}</dataValidations>`
    : '';

  return (
    ENTETE_XML +
    `<worksheet xmlns="${ESPACE_TABLEUR}" xmlns:r="${ESPACE_RELATIONS}">` +
    `<sheetViews><sheetView workbookViewId="0"${premiere ? ' tabSelected="1"' : ''}>` +
    `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>` +
    `</sheetView></sheetViews>` +
    colonnes +
    `<sheetData>${lignes}</sheetData>` +
    listes +
    `</worksheet>`
  );
}

/** Trois styles : défaut, en-tête en gras, texte renvoyé à la ligne en haut de cellule. */
const STYLES =
  ENTETE_XML +
  `<styleSheet xmlns="${ESPACE_TABLEUR}">` +
  `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>` +
  `<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
  `<fills count="2"><fill><patternFill patternType="none"/></fill>` +
  `<fill><patternFill patternType="gray125"/></fill></fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="3">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
  `<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1">` +
  `<alignment vertical="top" wrapText="1"/></xf>` +
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

/** Les fichiers de l'archive, dans l'ordre où Excel les attend. */
function fichiersDuClasseur(feuilles: Feuille[]): { nom: string; contenu: string }[] {
  const chaines = new Map<string, number>();
  const xmlFeuilles = feuilles.map((feuille, index) => xmlFeuille(feuille, index === 0, chaines));

  const partage =
    ENTETE_XML +
    `<sst xmlns="${ESPACE_TABLEUR}" count="${chaines.size}" uniqueCount="${chaines.size}">` +
    [...chaines.keys()].map((texte) => `<si><t xml:space="preserve">${echapper(texte)}</t></si>`).join('') +
    `</sst>`;

  return [
    {
      nom: '[Content_Types].xml',
      contenu:
        ENTETE_XML +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        feuilles
          .map(
            (_, index) =>
              `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join('') +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        `<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>` +
        `</Types>`,
    },
    {
      nom: '_rels/.rels',
      contenu:
        ENTETE_XML +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="${ESPACE_RELATIONS}/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`,
    },
    {
      nom: 'xl/workbook.xml',
      contenu:
        ENTETE_XML +
        `<workbook xmlns="${ESPACE_TABLEUR}" xmlns:r="${ESPACE_RELATIONS}"><sheets>` +
        feuilles
          .map(
            (feuille, index) =>
              `<sheet name="${echapper(feuille.nom)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
          )
          .join('') +
        `</sheets></workbook>`,
    },
    {
      nom: 'xl/_rels/workbook.xml.rels',
      contenu:
        ENTETE_XML +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        feuilles
          .map(
            (_, index) =>
              `<Relationship Id="rId${index + 1}" Type="${ESPACE_RELATIONS}/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
          )
          .join('') +
        `<Relationship Id="rId${feuilles.length + 1}" Type="${ESPACE_RELATIONS}/styles" Target="styles.xml"/>` +
        `<Relationship Id="rId${feuilles.length + 2}" Type="${ESPACE_RELATIONS}/sharedStrings" Target="sharedStrings.xml"/>` +
        `</Relationships>`,
    },
    ...xmlFeuilles.map((contenu, index) => ({
      nom: `xl/worksheets/sheet${index + 1}.xml`,
      contenu,
    })),
    { nom: 'xl/styles.xml', contenu: STYLES },
    { nom: 'xl/sharedStrings.xml', contenu: partage },
  ];
}

// --- Zip ---------------------------------------------------------------------

/*
 * Archive zip « stockée », sans compression. Le format le permet, Excel,
 * LibreOffice et Google Sheets l'ouvrent, et un modèle pèse quelques dizaines
 * de kilo-octets : compresser n'apporterait rien qu'une dépendance de plus.
 */

const TABLE_CRC = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(octets: Uint8Array): number {
  let crc = 0xffffffff;
  for (const octet of octets) crc = TABLE_CRC[(crc ^ octet) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStocke(fichiers: { nom: string; octets: Uint8Array }[]): Uint8Array {
  const encodeur = new TextEncoder();
  const morceaux: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let decalage = 0;

  // Date fixe (1er janvier 2026, minuit) : deux téléchargements du même
  // catalogue donnent le même fichier, octet pour octet.
  const heureDos = 0;
  const dateDos = ((2026 - 1980) << 9) | (1 << 5) | 1;

  for (const fichier of fichiers) {
    const nom = encodeur.encode(fichier.nom);
    const crc = crc32(fichier.octets);
    const taille = fichier.octets.length;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // noms en UTF-8
    local.setUint16(8, 0, true); // stocké
    local.setUint16(10, heureDos, true);
    local.setUint16(12, dateDos, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, taille, true);
    local.setUint32(22, taille, true);
    local.setUint16(26, nom.length, true);
    local.setUint16(28, 0, true);

    const entree = new DataView(new ArrayBuffer(46));
    entree.setUint32(0, 0x02014b50, true);
    entree.setUint16(4, 20, true);
    entree.setUint16(6, 20, true);
    entree.setUint16(8, 0x0800, true);
    entree.setUint16(10, 0, true);
    entree.setUint16(12, heureDos, true);
    entree.setUint16(14, dateDos, true);
    entree.setUint32(16, crc, true);
    entree.setUint32(20, taille, true);
    entree.setUint32(24, taille, true);
    entree.setUint16(28, nom.length, true);
    entree.setUint32(42, decalage, true);

    morceaux.push(new Uint8Array(local.buffer), nom, fichier.octets);
    central.push(new Uint8Array(entree.buffer), nom);
    decalage += 30 + nom.length + taille;
  }

  const tailleCentrale = central.reduce((somme, morceau) => somme + morceau.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, fichiers.length, true);
  fin.setUint16(10, fichiers.length, true);
  fin.setUint32(12, tailleCentrale, true);
  fin.setUint32(16, decalage, true);

  const tout = [...morceaux, ...central, new Uint8Array(fin.buffer)];
  const resultat = new Uint8Array(tout.reduce((somme, morceau) => somme + morceau.length, 0));
  let position = 0;
  for (const morceau of tout) {
    resultat.set(morceau, position);
    position += morceau.length;
  }
  return resultat;
}

export function ecrireClasseur(feuilles: Feuille[]): Uint8Array {
  const encodeur = new TextEncoder();
  return zipStocke(
    fichiersDuClasseur(feuilles).map(({ nom, contenu }) => ({
      nom,
      octets: encodeur.encode(contenu),
    })),
  );
}
