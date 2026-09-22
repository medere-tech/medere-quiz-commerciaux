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

export const STATUTS_QUESTION = ['brouillon', 'aRelire', 'publiee'] as const;
export type StatutQuestion = (typeof STATUTS_QUESTION)[number];

/**
 * Les statuts qui sortent aux commerciaux.
 *
 * **« À relire » est servi, et c'est la décision du lot.** Le statut se place
 * *à côté* de « publiée », pas entre le brouillon et elle : il dit « cette
 * question demande du travail », pas « cette question ne sort plus ».
 *
 * Trois raisons, et la première suffirait :
 *
 * 1. **Le signal qui la met à relire est un taux d'échec** — donc des réponses.
 *    La retirer figerait la statistique au moment du marquage, et l'on
 *    perdrait le seul moyen de savoir si la réécriture a servi.
 * 2. **Une question mal formulée reste une question vraie.** Sa bonne réponse
 *    ne devient pas fausse parce que l'énoncé est confus ; la retirer punit le
 *    commercial du retard de Noémie.
 * 3. **Il existe déjà un état pour « ne sort plus » : le brouillon.** Un
 *    troisième statut qui ne sortirait pas serait un second brouillon.
 *
 * Le corollaire est dit à l'écran : une question *fausse* se remet en
 * brouillon, d'un clic, et elle sort immédiatement.
 */
export const STATUTS_SERVIS: readonly StatutQuestion[] = ['publiee', 'aRelire'];

/** Cette question sort-elle aux commerciaux ? */
export function estServie(statut: StatutQuestion): boolean {
  return STATUTS_SERVIS.includes(statut);
}

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
  aRelire: 'À relire',
  publiee: 'Publiée',
};

/**
 * La teinte d'étiquette de chaque statut.
 *
 * Elle vit ici, à côté de la liste, pour qu'un statut ajouté ne puisse pas
 * arriver à l'écran sans teinte — le type l'exige. « À relire » prend le jaune
 * d'attention de la maquette : ni le vert d'une question en service, ni le gris
 * d'un brouillon.
 */
export const TONS_STATUT: Record<StatutQuestion, 'brouillon' | 'attention' | 'publiee'> = {
  brouillon: 'brouillon',
  aRelire: 'attention',
  publiee: 'publiee',
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
  argumentaire: 600,
  /* Le nom sous lequel l'autrice signe son explication. Même borne que le nom
     d'affichage d'une séance : il s'affiche en bout de ligne, pas en titre. */
  explicationAuteur: 60,
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
  /**
   * L'angle de vente, distinct du pourquoi.
   *
   * L'explication dit pourquoi la réponse est juste ; l'argumentaire dit quoi
   * en faire au téléphone. **Facultatif, et ce n'est pas une facilité** : une
   * question de fait — « les assistants dentaires ont-ils un RPPS » — n'a pas
   * d'angle de vente, et en exiger un produirait du remplissage. Le
   * remplissage est pire que l'absence : on apprend à sauter la carte.
   */
  argumentaire: string;
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
  argumentaire: string;
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
    argumentaire: '',
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

/**
 * L'explication ou l'argumentaire ont-ils vraiment changé ?
 *
 * **C'est ce qui décide si la date affichée bouge.** `modifieeLe` suit chaque
 * enregistrement : une virgule corrigée la met à jour comme une réécriture. Or
 * l'écran du commercial annonce « mise à jour le… » *à côté de l'explication* —
 * cette date-là doit dire quand l'explication a changé, sinon elle n'apprend
 * rien et elle ment un peu.
 *
 * La comparaison ignore les espaces de bord et les espaces répétés : une
 * espace ajoutée en fin de ligne n'est pas une mise à jour. Elle ne fait rien
 * d'autre — une reformulation, même minime, en est une, et il n'appartient pas
 * au code de juger de l'ampleur d'une réécriture.
 */
export function explicationAChange(
  avant: { explication: string; argumentaire: string },
  apres: { explication: string; argumentaire: string },
): boolean {
  const net = (valeur: string) => valeur.trim().replace(/\s+/g, ' ');
  return (
    net(avant.explication) !== net(apres.explication) ||
    net(avant.argumentaire) !== net(apres.argumentaire)
  );
}

/**
 * Le nom sous lequel une explication est signée.
 *
 * **Recopié depuis la session, jamais lu depuis `users/{uid}`** : ce document
 * est fermé sans exception administrateur, et une question n'a pas le droit
 * d'aller y chercher un nom. C'est le motif déjà retenu pour l'animatrice
 * d'une séance — chacun publie le sien.
 *
 * Sans nom d'affichage, la partie locale de l'adresse fait l'affaire : mieux
 * vaut « noemie » qu'une signature vide. Borné, parce qu'il s'affiche en bout
 * de ligne sous une explication.
 */
export function nomDeSignature(utilisateur: {
  displayName?: string | null;
  email?: string | null;
}): string {
  const nom = (utilisateur.displayName ?? '').trim();
  const secours = (utilisateur.email ?? '').split('@')[0]?.trim() ?? '';
  return (nom || secours).slice(0, PLAFONDS.explicationAuteur);
}
