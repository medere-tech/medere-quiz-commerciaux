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

/**
 * Libellés d'interface, en français, pour les trois types.
 *
 * **Ils nomment le format, et c'est leur place : les listes et l'éditeur.**
 * Devant quelqu'un qui répond, ils ne conviennent pas — voir
 * `libelleAttendu` juste en dessous.
 */
export const LIBELLES_TYPE: Record<TypeQuestion, string> = {
  vf: 'Vrai ou faux',
  qcm: 'Choix multiples',
  scenario: 'Mise en situation',
};

/**
 * Ce que l'étiquette dit à qui s'apprête à répondre : **le nombre de réponses
 * attendues**, et non le format interne du modèle.
 *
 * **Le défaut qu'elle corrige.** L'étiquette affichait `LIBELLES_TYPE`, donc
 * « Choix multiples » pour **tout** QCM — y compris ceux qui n'ont qu'une bonne
 * réponse. Techniquement le terme est juste : un questionnaire à choix multiple
 * propose plusieurs options, il n'en attend pas plusieurs. Mais personne ne le
 * lit ainsi, et depuis l'ajout de la consigne, l'écran pouvait afficher
 * « CHOIX MULTIPLES » trois lignes au-dessus de « Une seule réponse. »
 * L'étiquette créait l'ambiguïté que la phrase venait de lever.
 *
 * **« Vrai ou faux » reste tel quel.** Il nomme les deux options elles-mêmes,
 * ne peut pas se lire comme « plusieurs réponses », et le remplacer par
 * « Une réponse » retirerait de l'information sans retirer d'ambiguïté.
 *
 * **« Mise en situation » disparaît de ces trois écrans**, et c'est assumé : le
 * contexte est affiché juste au-dessus de l'énoncé, en toutes lettres. Une mise
 * en situation peut attendre une réponse ou plusieurs, exactement comme un
 * QCM — l'ambiguïté était la même, la correction doit l'être aussi.
 *
 * Réservé aux écrans qui posent une question : la série, la séance côté
 * participant, l'écran projeté. Les listes et l'éditeur gardent
 * `LIBELLES_TYPE`, qui y est le bon nom — et qui y est d'ailleurs le seul
 * possible, puisqu'une question de liste ne porte pas ses bonnes réponses.
 */
export function libelleAttendu(question: {
  type: TypeQuestion;
  bonnesReponses: string[];
}): string {
  if (question.type === 'vf') return LIBELLES_TYPE.vf;
  return question.bonnesReponses.length > 1 ? 'Plusieurs réponses' : 'Une réponse';
}

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
