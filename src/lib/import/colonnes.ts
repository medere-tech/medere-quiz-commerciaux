/**
 * Contrat de colonnes de l'import.
 *
 * **Pourquoi un en-tête plutôt que des positions fixes.** Les questions sont
 * produites en lot avec une IA, et l'ordre des colonnes d'une réponse à
 * l'autre ne tient pas. Un import positionnel se tromperait en silence :
 * l'explication rangée dans le thème, personne ne le voit avant la session du
 * jeudi. Un en-tête nommé se trompe bruyamment, et c'est ce qu'on veut.
 *
 * Les noms sont reconnus sans accent ni casse, et plusieurs libellés
 * conduisent à la même colonne — « question » et « énoncé » désignent la même
 * chose, exiger l'un des deux serait un piège gratuit.
 */

export const COLONNES = [
  'format',
  'contexte',
  'enonce',
  'reponses',
  'bonnesReponses',
  'explication',
  'formations',
  'theme',
  'difficulte',
  'sourceFiche',
  'sourceVersion',
] as const;

export type Colonne = (typeof COLONNES)[number];

/** Ce sans quoi une question ne peut pas exister. */
export const COLONNES_OBLIGATOIRES: Colonne[] = [
  'format',
  'enonce',
  'reponses',
  'bonnesReponses',
  'explication',
  'formations',
  'theme',
];

/** Libellé affiché d'une colonne, pour localiser une erreur. */
export const LIBELLES_COLONNE: Record<Colonne, string> = {
  format: 'format',
  contexte: 'contexte',
  enonce: 'énoncé',
  reponses: 'réponses',
  bonnesReponses: 'bonne réponse',
  explication: 'explication',
  formations: 'formation',
  theme: 'thème',
  difficulte: 'difficulté',
  sourceFiche: 'fiche',
  sourceVersion: 'version',
};

/**
 * Le contexte n'est obligatoire que pour une mise en situation, et la
 * difficulté prend « facile » par défaut : ce sont des colonnes facultatives
 * dont l'absence ne bloque pas un import.
 */
const ALIAS: Record<Colonne, string[]> = {
  format: ['format', 'type', 'format de question', 'type de question'],
  contexte: ['contexte', 'situation', 'mise en situation', 'scenario'],
  enonce: ['enonce', 'question', 'intitule', 'libelle'],
  reponses: ['reponses', 'reponse', 'options', 'propositions', 'choix'],
  bonnesReponses: [
    'bonnes reponses',
    'bonne reponse',
    'reponses justes',
    'reponse juste',
    'bonnes',
    'correction',
  ],
  explication: ['explication', 'explications', 'justification'],
  formations: ['formations', 'formation', 'formations rattachees', 'formation rattachee'],
  theme: ['theme', 'themes', 'thematique'],
  difficulte: ['difficulte', 'niveau'],
  sourceFiche: ['source fiche', 'fiche', 'fiche d argumentaire', 'argumentaire', 'sourcefiche'],
  sourceVersion: ['source version', 'version', 'version de la fiche', 'sourceversion'],
};

/**
 * Forme comparable d'un en-tête : sans accent, sans casse, sans ponctuation.
 * « Bonne réponse », « bonne_reponse » et « BONNES RÉPONSES » désignent la
 * même colonne, et le tableur de Noémie n'a pas à le savoir.
 *
 * La bosse de casse est coupée avant le passage en minuscules, sinon
 * `bonnesReponses` deviendrait `bonnesreponses`, que rien ne reconnaîtrait —
 * y compris l'en-tête modèle que cet écran propose de copier.
 */
export function normaliserEntete(entete: string): string {
  return entete
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const COLONNE_PAR_ALIAS = new Map<string, Colonne>(
  COLONNES.flatMap((colonne) =>
    ALIAS[colonne].map((alias) => [normaliserEntete(alias), colonne] as const),
  ),
);

export type Association = {
  /** Index de la cellule pour chaque colonne reconnue. */
  index: Partial<Record<Colonne, number>>;
  /** En-têtes présents dans le collage mais qui ne correspondent à rien. */
  ignorees: string[];
  /** Colonnes obligatoires absentes. L'import ne peut pas démarrer sans. */
  manquantes: Colonne[];
};

export function associerColonnes(entetes: string[]): Association {
  const index: Partial<Record<Colonne, number>> = {};
  const ignorees: string[] = [];

  entetes.forEach((entete, position) => {
    const colonne = COLONNE_PAR_ALIAS.get(normaliserEntete(entete));

    // Première occurrence gagnante : deux colonnes du même nom sont une
    // maladresse de collage, pas une intention.
    if (colonne && index[colonne] === undefined) index[colonne] = position;
    else if (entete.trim().length > 0) ignorees.push(entete);
  });

  return {
    index,
    ignorees,
    manquantes: COLONNES_OBLIGATOIRES.filter((colonne) => index[colonne] === undefined),
  };
}

/**
 * Ligne d'en-tête proposée à qui n'en a pas, ou s'est trompé de noms. Elle se
 * colle telle quelle au-dessus d'un tableau.
 */
export const ENTETE_MODELE = [
  'format',
  'enonce',
  'contexte',
  'reponses',
  'bonnesReponses',
  'explication',
  'formations',
  'theme',
  'difficulte',
  'sourceFiche',
  'sourceVersion',
].join('\t');
