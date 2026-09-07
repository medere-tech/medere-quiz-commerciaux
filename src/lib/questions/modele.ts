/**
 * Modèle d'une question, côté application.
 *
 * Les valeurs de ce fichier sont le miroir de `firestore.rules`. Les règles
 * restent l'autorité — elles s'appliquent à toute écriture, d'où qu'elle
 * vienne — mais elles ne savent dire que « refusé ». C'est ici qu'on sait
 * *pourquoi*, et c'est ce que l'éditeur affiche à Noémie.
 *
 * Toute modification d'un plafond se fait des deux côtés, sans quoi
 * l'interface promet un enregistrement que les règles refuseront.
 */

export const TYPES_QUESTION = ['vf', 'qcm', 'scenario'] as const;
export type TypeQuestion = (typeof TYPES_QUESTION)[number];

export const STATUTS_QUESTION = ['brouillon', 'publiee'] as const;
export type StatutQuestion = (typeof STATUTS_QUESTION)[number];

export const DIFFICULTES = [1, 2, 3] as const;
export type Difficulte = (typeof DIFFICULTES)[number];

/** Libellés d'interface, en français, pour les trois types. */
export const LIBELLES_TYPE: Record<TypeQuestion, string> = {
  vf: 'Vrai ou faux',
  qcm: 'Choix multiples',
  scenario: 'Mise en situation',
};

export const LIBELLES_STATUT: Record<StatutQuestion, string> = {
  brouillon: 'Brouillon',
  publiee: 'Publiée',
};

export const LIBELLES_DIFFICULTE: Record<Difficulte, string> = {
  1: 'Facile',
  2: 'Moyenne',
  3: 'Difficile',
};

/**
 * Plafonds de longueur. Les huit premiers sont ceux des règles Firestore
 * (README, section 4). Les deux derniers — identifiant et libellé d'option —
 * n'y figurent pas : les règles ne savent pas parcourir les valeurs d'une map.
 * C'est le trou documenté au README, et c'est ici qu'il se referme pour la
 * saisie unitaire, comme il se refermera pour l'import en masse.
 */
export const PLAFONDS = {
  enonce: 500,
  explication: 1000,
  contexte: 1000,
  theme: 60,
  sourceFiche: 200,
  sourceVersion: 40,
  formationIdsCumul: 1000,
  bonnesReponsesCumul: 1000,
  optionsClesCumul: 2000,
  ordreOptionsCumul: 2000,
  // Hors règles : contrôles propres à l'application.
  optionIdentifiant: 40,
  optionTexte: 300,
} as const;

/** Une question offre au moins deux options ; au-delà, aucun plafond. */
export const OPTIONS_MINIMUM = 2;

/** Ce que l'éditeur manipule : des chaînes, jamais `null` ni `undefined`. */
export type BrouillonQuestion = {
  type: TypeQuestion;
  contexte: string;
  enonce: string;
  options: Record<string, string>;
  ordreOptions: string[];
  bonnesReponses: string[];
  explication: string;
  formationIds: string[];
  theme: string;
  difficulte: Difficulte;
  statut: StatutQuestion;
  sourceFiche: string;
  sourceVersion: string;
};

/** Ce qui part vers Firestore. `contexte` y vaut `null` hors mise en situation. */
export type QuestionAEcrire = {
  type: TypeQuestion;
  contexte: string | null;
  enonce: string;
  options: Record<string, string>;
  ordreOptions: string[];
  bonnesReponses: string[];
  explication: string;
  formationIds: string[];
  theme: string;
  difficulte: Difficulte;
  statut: StatutQuestion;
  sourceFiche?: string;
  sourceVersion?: string;
};

/** Brouillon vierge, pour la création d'une question. */
export function brouillonVierge(): BrouillonQuestion {
  return {
    type: 'vf',
    contexte: '',
    enonce: '',
    options: { vrai: 'Vrai', faux: 'Faux' },
    ordreOptions: ['vrai', 'faux'],
    bonnesReponses: [],
    explication: '',
    formationIds: [],
    theme: '',
    difficulte: 1,
    statut: 'brouillon',
    sourceFiche: '',
    sourceVersion: '',
  };
}

/** Le contexte n'a de sens que pour une mise en situation. */
export function accepteUnContexte(type: TypeQuestion): boolean {
  return type === 'scenario';
}
