import type { Formation } from '@/lib/formations/depot';
import {
  DIFFICULTES,
  TYPES_QUESTION,
  type BrouillonQuestion,
  type Difficulte,
  type QuestionAEcrire,
  type TypeQuestion,
} from '@/lib/questions/modele';
import { validerQuestion, type ErreurChamp } from '@/lib/questions/validation';
import { COLONNES, LIBELLES_COLONNE, normaliserEntete, type Colonne } from '@/lib/import/colonnes';

/**
 * D'une ligne de tableau à une question.
 *
 * **Ce fichier ne valide rien.** Il traduit : un format écrit en français
 * devient un type, des libellés séparés par des barres deviennent une map
 * d'options, un nom de formation devient un identifiant Airtable. Puis il
 * passe le résultat à `validerQuestion`, la même fonction que l'éditeur.
 *
 * C'est une règle, pas une commodité. Deux validations pour un même modèle
 * divergent toujours : l'une gagne une contrainte que l'autre ignore, et six
 * mois plus tard l'import accepte ce que l'éditeur refuse. Ici, tout ce qui
 * touche à la validité d'un champ — longueurs, obligations, libellés
 * d'options non vides — vient de `validerQuestion`. Ce qui est écrit ici ne
 * concerne que ce qu'elle ne peut pas savoir : comment lire une cellule.
 *
 * **Tout arrive en brouillon.** Le statut n'est pas une colonne et ne le sera
 * pas. Un lot produit par une IA se relit avant d'entrer dans les séries ;
 * laisser l'import publier directement supprimerait la seule relecture du
 * processus.
 */

/** Même normalisation que pour les en-têtes : sans accent, sans casse, sans ponctuation. */
const comparable = normaliserEntete;

/** Séparateur des valeurs multiples à l'intérieur d'une cellule. */
export const SEPARATEUR_VALEURS = '|';

export type ErreurLigne = {
  /** Colonne à mettre en évidence. `null` pour une erreur qui n'en vise aucune. */
  colonne: Colonne | null;
  message: string;
  /**
   * Valeur exacte mise en cause dans une cellule qui en contient plusieurs.
   * Sans elle, corriger une formation inconnue au milieu de trois valides
   * écraserait les deux autres.
   */
  jeton?: string;
};

/** Une ligne du collage, réduite à ses cellules nommées. */
export type LigneImport = {
  numero: number;
  valeurs: Record<Colonne, string>;
};

/**
 * Ce qui mérite d'être dit sans empêcher d'importer.
 *
 * Une erreur retient la ligne ; un avertissement la laisse passer en le
 * disant. La distinction compte : une difficulté non déclarée ou un doublon
 * peuvent être voulus, et refuser la ligne obligerait Noémie à contourner
 * l'outil pour faire ce qu'elle voulait faire.
 */
export type AvertissementLigne = {
  genre: 'difficulte-par-defaut' | 'doublon';
  message: string;
};

export type LigneAnalysee = {
  ligne: LigneImport;
  brouillon: BrouillonQuestion;
  /** Renseignée seulement quand la ligne est bonne à écrire. */
  question: QuestionAEcrire | null;
  erreurs: ErreurLigne[];
  avertissements: AvertissementLigne[];
};

// --- Traduction des valeurs écrites à la main -----------------------------

const FORMATS: Record<string, TypeQuestion> = {
  vf: 'vf',
  'vrai faux': 'vf',
  'vrai ou faux': 'vf',
  'vrai/faux': 'vf',
  qcm: 'qcm',
  'choix multiples': 'qcm',
  'choix multiple': 'qcm',
  'reponses multiples': 'qcm',
  scenario: 'scenario',
  'mise en situation': 'scenario',
  situation: 'scenario',
};

const DIFFICULTES_ECRITES: Record<string, Difficulte> = {
  '1': 1,
  facile: 1,
  '2': 2,
  moyenne: 2,
  moyen: 2,
  '3': 3,
  difficile: 3,
};

/**
 * Les deux options d'un vrai ou faux quand la colonne « réponses » est vide.
 * L'éditeur les impose de la même façon : on ne demande pas de retaper
 * « Vrai » et « Faux » à chaque ligne.
 */
const VRAI_FAUX = ['Vrai', 'Faux'];

function decouperValeurs(cellule: string): string[] {
  return cellule
    .split(SEPARATEUR_VALEURS)
    .map((valeur) => valeur.trim())
    .filter((valeur) => valeur.length > 0);
}

// --- Correspondance entre les champs du modèle et les colonnes -------------

/**
 * `validerQuestion` désigne un champ du modèle ; la prévisualisation montre
 * des colonnes. Sans cette table, une erreur d'explication s'afficherait sans
 * dire où corriger — or c'est tout ce qu'on demande à un message d'erreur
 * d'import : le numéro de ligne et la colonne.
 */
const COLONNE_PAR_CHAMP: Record<string, Colonne> = {
  type: 'format',
  enonce: 'enonce',
  contexte: 'contexte',
  options: 'reponses',
  ordreOptions: 'reponses',
  bonnesReponses: 'bonnesReponses',
  explication: 'explication',
  formationIds: 'formations',
  theme: 'theme',
  difficulte: 'difficulte',
  sourceFiche: 'sourceFiche',
  sourceVersion: 'sourceVersion',
};

// --- Référentiel des formations -------------------------------------------

export type IndexFormations = Map<string, Formation>;

/**
 * Noémie écrit un nom de formation, pas un identifiant Airtable. Le nom, le
 * numéro d'action DPC et l'identifiant conduisent tous trois à la même
 * formation : on accepte les trois plutôt que d'imposer celui qu'elle n'a pas
 * sous les yeux.
 */
export function indexerFormations(formations: Formation[]): IndexFormations {
  const index: IndexFormations = new Map();

  for (const formation of formations) {
    index.set(comparable(formation.id), formation);
    if (formation.numeroActionDpc) index.set(comparable(formation.numeroActionDpc), formation);
    // Le nom est le moins fiable des trois : deux formations peuvent le
    // partager. La première inscrite gagne, et l'identifiant reste disponible
    // pour trancher.
    const nom = comparable(formation.nom);
    if (nom.length > 0 && !index.has(nom)) index.set(nom, formation);
  }

  return index;
}

// --- Analyse d'une ligne ---------------------------------------------------

function valeursVides(): Record<Colonne, string> {
  return Object.fromEntries(COLONNES.map((colonne) => [colonne, ''])) as Record<Colonne, string>;
}

export function ligneVierge(numero: number): LigneImport {
  return { numero, valeurs: valeursVides() };
}

export function analyserLigne(
  ligne: LigneImport,
  formations: IndexFormations,
): LigneAnalysee {
  const erreurs: ErreurLigne[] = [];
  const avertissements: AvertissementLigne[] = [];
  const signaler = (colonne: Colonne | null, message: string, jeton?: string) =>
    erreurs.push({ colonne, message, jeton });

  const valeurs = ligne.valeurs;

  // --- Format
  const formatEcrit = valeurs.format.trim();
  const type = FORMATS[comparable(formatEcrit)];
  if (!type) {
    signaler(
      'format',
      formatEcrit.length === 0
        ? 'Le format est vide. Écrivez « vrai ou faux », « choix multiples » ou « mise en situation ».'
        : `Format « ${formatEcrit} » inconnu. Écrivez « vrai ou faux », « choix multiples » ou « mise en situation ».`,
    );
  }

  // --- Options
  const libelles = decouperValeurs(valeurs.reponses);
  const effectifs = libelles.length === 0 && type === 'vf' ? [...VRAI_FAUX] : libelles;

  // Les identifiants sont posés ici, dans l'ordre du collage : un tableau ne
  // porte pas d'identifiants d'options, et l'ordre lu est le seul ordre connu.
  const ordreOptions = effectifs.map((_, position) => `o${position + 1}`);
  const options = Object.fromEntries(
    effectifs.map((libelle, position) => [`o${position + 1}`, libelle]),
  );

  // --- Bonnes réponses
  const bonnesReponses = resoudreBonnesReponses(
    valeurs.bonnesReponses,
    effectifs,
    ordreOptions,
    signaler,
  );

  // --- Formations
  const formationIds = resoudreFormations(valeurs.formations, formations, signaler);

  // --- Difficulté
  const difficulteEcrite = valeurs.difficulte.trim();
  let difficulte: Difficulte = 1;
  if (difficulteEcrite.length === 0) {
    // Le défaut est commode, mais il ne doit pas être silencieux : un lot
    // entier rangé en « facile » sans que personne ne l'ait décidé fausse le
    // tirage des séries.
    avertissements.push({
      genre: 'difficulte-par-defaut',
      message: 'Difficulté non déclarée : la question entre en « facile ».',
    });
  } else {
    const trouvee = DIFFICULTES_ECRITES[comparable(difficulteEcrite)];
    if (trouvee) difficulte = trouvee;
    else {
      signaler(
        'difficulte',
        `Difficulté « ${difficulteEcrite} » inconnue. Écrivez « facile », « moyenne », « difficile », ou ${DIFFICULTES.join(', ')}.`,
      );
    }
  }

  const brouillon: BrouillonQuestion = {
    type: (type ?? 'qcm') as TypeQuestion,
    contexte: valeurs.contexte,
    enonce: valeurs.enonce,
    options,
    ordreOptions,
    bonnesReponses,
    explication: valeurs.explication,
    formationIds,
    theme: valeurs.theme,
    difficulte,
    // Jamais publiée par un import : la relecture n'est pas facultative.
    statut: 'brouillon',
    sourceFiche: valeurs.sourceFiche,
    sourceVersion: valeurs.sourceVersion,
  };

  // La validation partagée passe en dernier, sur ce qui a été traduit. Les
  // colonnes déjà signalées sont écartées de son verdict : dire deux fois la
  // même chose sur une ligne fait chercher deux corrections là où il n'y en a
  // qu'une.
  const dejaSignalees = new Set(erreurs.map((erreur) => erreur.colonne));
  const resultat = validerQuestion(brouillon);

  if (!resultat.valide) {
    for (const erreur of resultat.erreurs as ErreurChamp[]) {
      const colonne = COLONNE_PAR_CHAMP[erreur.champ] ?? null;
      if (dejaSignalees.has(colonne)) continue;
      signaler(colonne, erreur.message);
    }
  }

  return {
    ligne,
    brouillon,
    question: erreurs.length === 0 && resultat.valide ? resultat.question : null,
    erreurs,
    avertissements,
  };
}

/**
 * Rapprochement des énoncés : dans le lot lui-même, et avec la banque.
 *
 * Réimporter deux fois le même fichier crée soixante doublons sans un mot.
 * On les signale — jamais on ne les bloque : réimporter volontairement une
 * variante d'un énoncé existant est légitime, et l'outil n'a pas à en juger.
 *
 * La comparaison porte sur l'énoncé seul, sans accent ni casse : c'est ce que
 * l'œil reconnaît comme « la même question ».
 */
export function signalerDoublons(
  analyses: LigneAnalysee[],
  enoncesExistants: string[],
): LigneAnalysee[] {
  const enBanque = new Set(enoncesExistants.map(comparable));
  const vusDansLeLot = new Map<string, number>();

  return analyses.map((analyse) => {
    const enonce = comparable(analyse.ligne.valeurs.enonce);
    if (enonce.length === 0) return analyse;

    const avertissements = [...analyse.avertissements];
    const premiere = vusDansLeLot.get(enonce);

    if (premiere !== undefined) {
      avertissements.push({
        genre: 'doublon',
        message: `Énoncé déjà présent ligne ${premiere} de ce même tableau.`,
      });
    } else if (enBanque.has(enonce)) {
      avertissements.push({
        genre: 'doublon',
        message: 'Énoncé déjà présent dans la banque. L’import en créera une seconde.',
      });
    }

    if (premiere === undefined) vusDansLeLot.set(enonce, analyse.ligne.numero);

    return avertissements.length === analyse.avertissements.length
      ? analyse
      : { ...analyse, avertissements };
  });
}

function resoudreBonnesReponses(
  cellule: string,
  libelles: string[],
  ordreOptions: string[],
  signaler: (colonne: Colonne | null, message: string, jeton?: string) => void,
): string[] {
  const brut = cellule.trim();
  if (brut.length === 0) return [];

  // Un libellé peut contenir une virgule — « Chirurgiens-dentistes, assistants
  // dentaires » est une seule réponse. On tente donc la cellule entière avant
  // de la découper : découper d'abord casserait ces libellés-là.
  const entier = trouverOption(brut, libelles, ordreOptions);
  if (entier) return [entier];

  const jetons = brut
    .split(/[|,]/)
    .map((jeton) => jeton.trim())
    .filter((jeton) => jeton.length > 0);

  const identifiants: string[] = [];

  for (const jeton of jetons) {
    const identifiant = trouverOption(jeton, libelles, ordreOptions);
    if (!identifiant) {
      signaler(
        'bonnesReponses',
        `Bonne réponse « ${jeton} » : aucune réponse ne porte ce libellé. ` +
          `Reprenez le libellé exact, ou son numéro de 1 à ${libelles.length || 1}.`,
        jeton,
      );
      continue;
    }
    if (!identifiants.includes(identifiant)) identifiants.push(identifiant);
  }

  return identifiants;
}

/** Une bonne réponse se désigne par son numéro d'affichage ou par son libellé. */
function trouverOption(
  jeton: string,
  libelles: string[],
  ordreOptions: string[],
): string | undefined {
  if (/^\d+$/.test(jeton)) {
    const position = Number(jeton) - 1;
    return ordreOptions[position];
  }

  const cherche = comparable(jeton);
  const position = libelles.findIndex((libelle) => comparable(libelle) === cherche);
  return position >= 0 ? ordreOptions[position] : undefined;
}

function resoudreFormations(
  cellule: string,
  formations: IndexFormations,
  signaler: (colonne: Colonne | null, message: string, jeton?: string) => void,
): string[] {
  const identifiants: string[] = [];

  for (const jeton of decouperValeurs(cellule)) {
    const formation = formations.get(comparable(jeton));
    if (!formation) {
      signaler(
        'formations',
        `Formation « ${jeton} » inconnue. Reprenez son nom exact ou son numéro d'action DPC, ` +
          `ou choisissez-la dans la liste.`,
        jeton,
      );
      continue;
    }
    if (!identifiants.includes(formation.id)) identifiants.push(formation.id);
  }

  return identifiants;
}

/** Libellé d'une colonne, pour composer un message qui situe l'erreur. */
export function libelleColonne(colonne: Colonne | null): string {
  return colonne ? LIBELLES_COLONNE[colonne] : 'ligne';
}

/** Les valeurs acceptées dans la colonne « format », pour un correctif guidé. */
export const FORMATS_PROPOSES: { valeur: string; libelle: string }[] = TYPES_QUESTION.map(
  (type) => ({
    valeur: type,
    libelle: { vf: 'vrai ou faux', qcm: 'choix multiples', scenario: 'mise en situation' }[type],
  }),
);
