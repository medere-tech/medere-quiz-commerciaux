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
import { normaliserEnonce } from '@/lib/texte';
import { ANGLES, reconnaitreAngle } from '@/lib/questions/angles';

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
  genre: 'difficulte-par-defaut' | 'doublon' | 'angle-hors-liste';
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
  argumentaire: 'argumentaire',
  formationIds: 'formations',
  theme: 'theme',
  difficulte: 'difficulte',
  sourceFiche: 'sourceFiche',
  sourceVersion: 'sourceVersion',
};

// --- Référentiel des formations -------------------------------------------

/**
 * Ce qu'une valeur de la colonne « formations » désigne : une formation, ou
 * plusieurs quand elle est ambiguë.
 */
export type IndexFormations = Map<string, Formation[]>;

/**
 * Noémie écrit un nom de formation, pas un identifiant Airtable. Le nom, le
 * numéro d'action DPC et l'identifiant conduisent tous trois à la même
 * formation : on accepte les trois plutôt que d'imposer celui qu'elle n'a pas
 * sous les yeux.
 *
 * **Un nom partagé ne désigne personne.** Le catalogue compte des homonymes,
 * dont certains opposent une formation active à une formation suspendue.
 * « La première inscrite gagne » rattachait la question à l'une des deux au
 * hasard de l'ordre alphabétique des identifiants — parfois à celle qu'on ne
 * vend plus. Chaque formation qui porte le nom est donc retenue, et la ligne
 * est refusée avec les numéros entre lesquels choisir.
 */
export function indexerFormations(formations: Formation[]): IndexFormations {
  const index: IndexFormations = new Map();
  const ajouter = (cle: string, formation: Formation) => {
    if (cle.length === 0) return;
    const deja = index.get(cle) ?? [];
    if (!deja.some((autre) => autre.id === formation.id)) index.set(cle, [...deja, formation]);
  };

  for (const formation of formations) {
    ajouter(comparable(formation.id), formation);
    if (formation.numeroActionDpc) ajouter(comparable(formation.numeroActionDpc), formation);
    ajouter(comparable(formation.nom), formation);
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

  // --- Angle
  // Une variante reconnue prend sa forme canonique ; un angle hors liste
  // passe tel qu'écrit, et le dit. Un angle vide reste une erreur, que la
  // validation partagée signale.
  const angleEcrit = valeurs.theme.trim();
  const angle = reconnaitreAngle(angleEcrit);
  if (angleEcrit.length > 0 && !angle) {
    avertissements.push({
      genre: 'angle-hors-liste',
      message:
        `Angle « ${angleEcrit} » hors des cinq de l’argumentaire : la question entre telle quelle. ` +
        `Si elle relève de l’un d’eux, écrivez plutôt ${ANGLES.map((nom) => `« ${nom} »`).join(', ')}.`,
    });
  }

  const brouillon: BrouillonQuestion = {
    type: (type ?? 'qcm') as TypeQuestion,
    contexte: valeurs.contexte,
    enonce: valeurs.enonce,
    options,
    ordreOptions,
    bonnesReponses,
    explication: valeurs.explication,
    argumentaire: valeurs.argumentaire,
    formationIds,
    theme: angle ?? valeurs.theme,
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
  // `enoncesExistants` arrive déjà normalisé : c'est la forme que Firestore a
  // rendue. On normalise de la même manière ce qui vient du tableau collé,
  // pour que les deux ensembles se comparent sur le même pied.
  const enBanque = new Set(enoncesExistants.map(normaliserEnonce));
  const vusDansLeLot = new Map<string, number>();

  return analyses.map((analyse) => {
    const enonce = normaliserEnonce(analyse.ligne.valeurs.enonce);
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

/*
 * **Une valeur à deux lectures est refusée, jamais tranchée.**
 *
 * Une bonne réponse qui désigne la mauvaise proposition ne lève rien : la
 * question entre en banque, la mauvaise réponse est marquée juste, et le
 * commercial apprend une erreur qu'il répétera devant un praticien. Aucune
 * règle de priorité — « le libellé d'abord », « le numéro d'abord » — ne
 * rattrape ce cas : elle ne fait que choisir laquelle des deux lectures sera
 * fausse sans le dire. Quand une cellule en admet deux, la ligne est refusée
 * avec de quoi lever l'ambiguïté.
 */

type Lecture =
  | { etat: 'trouvee'; identifiant: string }
  | { etat: 'absente' }
  | { etat: 'ambigue'; message: string };

function resoudreBonnesReponses(
  cellule: string,
  libelles: string[],
  ordreOptions: string[],
  signaler: (colonne: Colonne | null, message: string, jeton?: string) => void,
): string[] {
  const brut = cellule.trim();
  if (brut.length === 0) return [];

  let jetons: string[];

  if (brut.includes(SEPARATEUR_VALEURS)) {
    // Le séparateur officiel est présent : lui seul découpe. Une virgule reste
    // alors dans le libellé, où elle a sa place.
    jetons = decouperValeurs(brut);
  } else {
    // Sans barre, la virgule est tolérée comme séparateur — mais un libellé
    // peut en contenir une : « Chirurgiens-dentistes, assistants dentaires »
    // est une seule réponse. Les deux lectures sont tentées ; si toutes deux
    // aboutissent, la cellule dit deux choses différentes.
    const entiere = trouverOption(brut, libelles, ordreOptions);
    const parVirgule = brut.includes(',')
      ? brut.split(',').map((jeton) => jeton.trim()).filter((jeton) => jeton.length > 0)
      : [];
    const decoupeAboutit =
      parVirgule.length > 1 &&
      parVirgule.every((jeton) => trouverOption(jeton, libelles, ordreOptions).etat === 'trouvee');

    if (entiere.etat === 'trouvee' && decoupeAboutit) {
      signaler(
        'bonnesReponses',
        `Bonne réponse « ${brut} » : c'est à la fois une proposition entière et une liste de ` +
          `${parVirgule.length} propositions. Séparez plusieurs réponses par « ${SEPARATEUR_VALEURS} », ` +
          `ou désignez-les par leur numéro.`,
        brut,
      );
      return [];
    }
    if (entiere.etat === 'trouvee') return [entiere.identifiant];
    if (entiere.etat === 'ambigue') {
      signaler('bonnesReponses', entiere.message, brut);
      return [];
    }
    jetons = parVirgule.length > 1 ? parVirgule : [brut];
  }

  const identifiants: string[] = [];

  for (const jeton of jetons) {
    const lecture = trouverOption(jeton, libelles, ordreOptions);
    if (lecture.etat === 'ambigue') {
      signaler('bonnesReponses', lecture.message, jeton);
      continue;
    }
    if (lecture.etat === 'absente') {
      signaler(
        'bonnesReponses',
        `Bonne réponse « ${jeton} » : aucune réponse ne porte ce libellé. ` +
          `Reprenez le libellé exact, ou son numéro de 1 à ${libelles.length || 1}.`,
        jeton,
      );
      continue;
    }
    if (!identifiants.includes(lecture.identifiant)) identifiants.push(lecture.identifiant);
  }

  return identifiants;
}

/**
 * Une bonne réponse se désigne par son numéro d'affichage ou par son libellé.
 *
 * Deux lectures possibles, et chacune peut tomber sur plusieurs cibles :
 *
 * - un nombre est un numéro, **et** peut être le libellé d'une proposition —
 *   « 1 » parmi « 3|1|2 » désigne la première par son numéro, la deuxième par
 *   son libellé ;
 * - un libellé peut être porté par deux propositions identiques.
 *
 * Quand les lectures possibles ne désignent pas toutes la même proposition,
 * rien n'est choisi.
 */
function trouverOption(jeton: string, libelles: string[], ordreOptions: string[]): Lecture {
  const cherche = comparable(jeton);
  const parLibelle = libelles.flatMap((libelle, position) =>
    comparable(libelle) === cherche ? [position] : [],
  );
  const parNumero = /^\d+$/.test(jeton.trim()) ? Number(jeton.trim()) - 1 : undefined;
  const numeroValide = parNumero !== undefined && parNumero >= 0 && parNumero < ordreOptions.length;

  const candidates = new Set([...parLibelle, ...(numeroValide ? [parNumero] : [])]);

  if (candidates.size === 0) return { etat: 'absente' };
  if (candidates.size === 1) {
    return { etat: 'trouvee', identifiant: ordreOptions[[...candidates][0]!]! };
  }

  if (parLibelle.length > 1) {
    return {
      etat: 'ambigue',
      message:
        `Bonne réponse « ${jeton} » : ${parLibelle.length} propositions portent ce libellé ` +
        `(n° ${parLibelle.map((position) => position + 1).join(', ')}). Rendez-les distinctes, ` +
        `ou désignez la bonne par son numéro.`,
    };
  }

  return {
    etat: 'ambigue',
    message:
      `Bonne réponse « ${jeton} » : c'est le numéro de la proposition « ${libelles[parNumero!]} » ` +
      `et le libellé de la proposition n° ${parLibelle[0]! + 1}. Écrivez l'unité dans les ` +
      `propositions (« ${jeton} heures », « bloc ${jeton} ») : un nombre ne désignera plus ` +
      `qu'un numéro.`,
  };
}

function resoudreFormations(
  cellule: string,
  formations: IndexFormations,
  signaler: (colonne: Colonne | null, message: string, jeton?: string) => void,
): string[] {
  const identifiants: string[] = [];

  for (const jeton of decouperValeurs(cellule)) {
    const trouvees = formations.get(comparable(jeton)) ?? [];
    if (trouvees.length === 0) {
      signaler(
        'formations',
        `Formation « ${jeton} » inconnue. Reprenez son nom exact ou son numéro d'action DPC, ` +
          `ou choisissez-la dans la liste.`,
        jeton,
      );
      continue;
    }
    if (trouvees.length > 1) {
      signaler(
        'formations',
        `« ${jeton} » désigne ${trouvees.length} formations : ` +
          trouvees
            .map(
              (formation) =>
                `${formation.numeroActionDpc || formation.id}${formation.actif ? '' : ' (suspendue)'}`,
            )
            .join(', ') +
          `. Écrivez le numéro de celle qui convient, ou choisissez-la dans la liste.`,
        jeton,
      );
      continue;
    }
    const formation = trouvees[0]!;
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
