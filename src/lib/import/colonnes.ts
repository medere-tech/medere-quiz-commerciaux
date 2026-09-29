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
  'argumentaire',
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
  argumentaire: 'argumentaire',
  formations: 'formation',
  theme: 'angle',
  difficulte: 'difficulté',
  sourceFiche: 'fiche',
  sourceVersion: 'version',
};

/**
 * Le contexte n'est obligatoire que pour une mise en situation, et la
 * difficulté prend « facile » par défaut : ce sont des colonnes facultatives
 * dont l'absence ne bloque pas un import.
 *
 * **« argumentaire » désigne l'argumentaire, et rien d'autre.** Le mot a
 * longtemps conduit à la colonne de la fiche source. C'était un piège actif :
 * une IA à qui l'on parle d'argumentaire produit volontiers une colonne de ce
 * nom, et son texte de vente atterrissait dans la référence de la fiche —
 * refusé au-delà de deux cents caractères, rangé au mauvais endroit en deçà,
 * sans un mot. La fiche source garde des noms sans ambiguïté.
 *
 * **La colonne de l'angle s'écrit `angle`**, et `theme` reste reconnu : c'est
 * le nom du champ en base, et l'ancien nom de la colonne.
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
  argumentaire: ['argumentaire', 'a l argumentaire', 'argument de vente', 'arguments de vente'],
  formations: ['formations', 'formation', 'formations rattachees', 'formation rattachee'],
  theme: ['angle', 'angles', 'angle de l argumentaire', 'theme', 'themes', 'thematique'],
  difficulte: ['difficulte', 'niveau'],
  sourceFiche: ['source fiche', 'fiche', 'fiche source', 'fiche d argumentaire', 'sourcefiche'],
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
  /**
   * Champs que plusieurs en-têtes désignent à la fois. L'import ne peut pas
   * démarrer non plus : il ne sait pas laquelle lire.
   */
  enDouble: { colonne: Colonne; entetes: string[] }[];
};

/**
 * **Deux colonnes pour un même champ, c'est deux lectures possibles.** Un
 * tableau qui porte « thème » et « angle », ou « question » et « énoncé »,
 * donne deux valeurs pour une seule case. La première lue gagnait, et la
 * seconde finissait parmi les « colonnes non utilisées » — une ligne discrète
 * sous l'analyse, pour une question qui pouvait entrer avec le mauvais énoncé.
 * L'en-tête est désormais refusé, avec les noms en conflit.
 */
export function associerColonnes(entetes: string[]): Association {
  const index: Partial<Record<Colonne, number>> = {};
  const ignorees: string[] = [];
  const parColonne = new Map<Colonne, string[]>();

  entetes.forEach((entete, position) => {
    const colonne = COLONNE_PAR_ALIAS.get(normaliserEntete(entete));

    if (colonne) {
      parColonne.set(colonne, [...(parColonne.get(colonne) ?? []), entete]);
      if (index[colonne] === undefined) index[colonne] = position;
    } else if (entete.trim().length > 0) ignorees.push(entete);
  });

  return {
    index,
    ignorees,
    manquantes: COLONNES_OBLIGATOIRES.filter((colonne) => index[colonne] === undefined),
    enDouble: [...parColonne]
      .filter(([, noms]) => noms.length > 1)
      .map(([colonne, noms]) => ({ colonne, entetes: noms })),
  };
}

/**
 * Les colonnes du modèle, dans l'ordre où on les remplit, avec le nom sous
 * lequel elles s'écrivent. La même liste sert l'en-tête à copier, les deux
 * fichiers téléchargeables et leurs exemples : un nom changé ici change
 * partout.
 */
export const COLONNES_MODELE: { colonne: Colonne; entete: string }[] = [
  { colonne: 'format', entete: 'format' },
  { colonne: 'enonce', entete: 'enonce' },
  { colonne: 'contexte', entete: 'contexte' },
  { colonne: 'reponses', entete: 'reponses' },
  { colonne: 'bonnesReponses', entete: 'bonnesReponses' },
  { colonne: 'explication', entete: 'explication' },
  { colonne: 'argumentaire', entete: 'argumentaire' },
  { colonne: 'formations', entete: 'formations' },
  { colonne: 'theme', entete: 'angle' },
  { colonne: 'difficulte', entete: 'difficulte' },
  { colonne: 'sourceFiche', entete: 'sourceFiche' },
  { colonne: 'sourceVersion', entete: 'sourceVersion' },
];

/**
 * Ligne d'en-tête proposée à qui n'en a pas, ou s'est trompé de noms. Elle se
 * colle telle quelle au-dessus d'un tableau.
 */
export const ENTETE_MODELE = COLONNES_MODELE.map(({ entete }) => entete).join('\t');
