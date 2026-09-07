import {
  DIFFICULTES,
  OPTIONS_MINIMUM,
  PLAFONDS,
  STATUTS_QUESTION,
  TYPES_QUESTION,
  accepteUnContexte,
  type BrouillonQuestion,
  type QuestionAEcrire,
} from '@/lib/questions/modele';

/**
 * Validation d'une question avant enregistrement.
 *
 * **Pourquoi elle existe alors que les règles Firestore refusent déjà.** Une
 * règle de sécurité ne sait dire que « permission refusée ». Renvoyer ça à
 * Noémie parce qu'elle a oublié l'explication est incompréhensible : elle n'a
 * pas un problème de droits, elle a un champ vide. Cette validation dit lequel,
 * et quoi faire.
 *
 * Elle ne remplace pas les règles, elle les double. Les règles restent la
 * seule garantie qui tienne face à un client modifié ; celle-ci existe pour
 * que le cas normal soit compréhensible.
 *
 * Deux contrôles n'existent qu'ici, faute de pouvoir vivre dans les règles :
 * la longueur des identifiants d'options et le fait que chaque libellé
 * d'option soit un texte non vide. Les règles ne parcourent pas les valeurs
 * d'une map.
 */

export type ErreurChamp = {
  /** Champ à mettre en évidence dans l'éditeur. */
  champ: string;
  message: string;
};

export type ResultatValidation =
  | { valide: true; question: QuestionAEcrire }
  | { valide: false; erreurs: ErreurChamp[] };

function texte(valeur: unknown): string {
  return typeof valeur === 'string' ? valeur.trim() : '';
}

export function validerQuestion(brouillon: BrouillonQuestion): ResultatValidation {
  const erreurs: ErreurChamp[] = [];
  const ajouter = (champ: string, message: string) => erreurs.push({ champ, message });

  const type = brouillon.type;
  if (!TYPES_QUESTION.includes(type)) {
    ajouter('type', 'Choisissez un type de question : vrai ou faux, choix multiples, ou mise en situation.');
  }

  const enonce = texte(brouillon.enonce);
  if (enonce.length === 0) {
    ajouter('enonce', "L'énoncé est obligatoire : c'est la question posée au commercial.");
  } else if (enonce.length > PLAFONDS.enonce) {
    ajouter(
      'enonce',
      `L'énoncé fait ${enonce.length} caractères, le maximum est ${PLAFONDS.enonce}. ` +
        `Une question doit rester lisible d'un coup d'œil.`,
    );
  }

  const explication = texte(brouillon.explication);
  if (explication.length === 0) {
    ajouter(
      'explication',
      "L'explication est obligatoire. Elle s'affiche après chaque réponse, y compris " +
        "quand elle est juste : c'est là que le commercial apprend.",
    );
  } else if (explication.length > PLAFONDS.explication) {
    ajouter(
      'explication',
      `L'explication fait ${explication.length} caractères, le maximum est ${PLAFONDS.explication}.`,
    );
  }

  const theme = texte(brouillon.theme);
  if (theme.length === 0) {
    ajouter('theme', 'Le thème est obligatoire : il sert à filtrer la banque de questions.');
  } else if (theme.length > PLAFONDS.theme) {
    ajouter('theme', `Le thème fait ${theme.length} caractères, le maximum est ${PLAFONDS.theme}.`);
  }

  // Le contexte n'existe que pour les mises en situation.
  const contexte = texte(brouillon.contexte);
  if (accepteUnContexte(type)) {
    if (contexte.length === 0) {
      ajouter(
        'contexte',
        'Une mise en situation a besoin de son contexte : la scène que le commercial doit lire avant de répondre.',
      );
    } else if (contexte.length > PLAFONDS.contexte) {
      ajouter(
        'contexte',
        `Le contexte fait ${contexte.length} caractères, le maximum est ${PLAFONDS.contexte}.`,
      );
    }
  }

  if (!DIFFICULTES.includes(brouillon.difficulte)) {
    ajouter('difficulte', 'Choisissez une difficulté : facile, moyenne ou difficile.');
  }

  if (!STATUTS_QUESTION.includes(brouillon.statut)) {
    ajouter('statut', 'Choisissez un statut : brouillon ou publiée.');
  }

  // --- Formations rattachées ---

  const formationIds = [...new Set(brouillon.formationIds.map((identifiant) => identifiant.trim()))]
    .filter((identifiant) => identifiant.length > 0);

  if (formationIds.length === 0) {
    ajouter(
      'formationIds',
      'Rattachez la question à au moins une formation : sans cela, elle ne sortira dans aucune série.',
    );
  } else if (formationIds.join(',').length > PLAFONDS.formationIdsCumul) {
    ajouter('formationIds', 'Trop de formations rattachées à cette question.');
  }

  // --- Options et bonnes réponses ---

  const identifiants = Object.keys(brouillon.options);

  if (identifiants.length < OPTIONS_MINIMUM) {
    ajouter(
      'options',
      `Une question a besoin d'au moins ${OPTIONS_MINIMUM} options de réponse.`,
    );
  }

  for (const identifiant of identifiants) {
    if (identifiant.length === 0 || identifiant.length > PLAFONDS.optionIdentifiant) {
      ajouter('options', `L'identifiant d'option « ${identifiant} » est vide ou trop long.`);
      continue;
    }

    const libelle = texte(brouillon.options[identifiant]);
    if (libelle.length === 0) {
      ajouter('options', 'Chaque option doit porter un libellé : une option vide ne veut rien dire.');
    } else if (libelle.length > PLAFONDS.optionTexte) {
      ajouter(
        'options',
        `Le libellé « ${libelle.slice(0, 30)}… » fait ${libelle.length} caractères, ` +
          `le maximum est ${PLAFONDS.optionTexte}.`,
      );
    }
  }

  if (identifiants.join(',').length > PLAFONDS.optionsClesCumul) {
    ajouter('options', "Trop d'options, ou des identifiants trop longs.");
  }

  // L'ordre d'affichage décrit exactement les options.
  const ordre = brouillon.ordreOptions;
  const ordreUnique = new Set(ordre);
  const memesElements =
    ordre.length === identifiants.length &&
    ordreUnique.size === ordre.length &&
    identifiants.every((identifiant) => ordreUnique.has(identifiant));

  if (!memesElements) {
    ajouter(
      'ordreOptions',
      "L'ordre d'affichage ne correspond plus aux options. Rechargez la question pour repartir d'un état propre.",
    );
  }

  const bonnesReponses = [...new Set(brouillon.bonnesReponses)];

  if (bonnesReponses.length === 0) {
    ajouter('bonnesReponses', 'Désignez au moins une bonne réponse.');
  } else {
    const inconnues = bonnesReponses.filter((identifiant) => !identifiants.includes(identifiant));
    if (inconnues.length > 0) {
      ajouter(
        'bonnesReponses',
        'Une bonne réponse désigne une option qui n’existe plus. Vérifiez les options.',
      );
    }
    if (bonnesReponses.join(',').length > PLAFONDS.bonnesReponsesCumul) {
      ajouter('bonnesReponses', 'Trop de bonnes réponses désignées.');
    }
  }

  // --- Traçabilité, facultative ---

  const sourceFiche = texte(brouillon.sourceFiche);
  if (sourceFiche.length > PLAFONDS.sourceFiche) {
    ajouter(
      'sourceFiche',
      `Le nom de la fiche fait ${sourceFiche.length} caractères, le maximum est ${PLAFONDS.sourceFiche}.`,
    );
  }

  const sourceVersion = texte(brouillon.sourceVersion);
  if (sourceVersion.length > PLAFONDS.sourceVersion) {
    ajouter(
      'sourceVersion',
      `La version fait ${sourceVersion.length} caractères, le maximum est ${PLAFONDS.sourceVersion}.`,
    );
  }

  if (erreurs.length > 0) return { valide: false, erreurs };

  const question: QuestionAEcrire = {
    type,
    contexte: accepteUnContexte(type) ? contexte : null,
    enonce,
    options: Object.fromEntries(
      identifiants.map((identifiant) => [identifiant, texte(brouillon.options[identifiant])]),
    ),
    ordreOptions: ordre,
    bonnesReponses,
    explication,
    formationIds,
    theme,
    difficulte: brouillon.difficulte,
    statut: brouillon.statut,
  };

  // Absents ou vides, les champs de source ne sont pas écrits : le modèle les
  // accepte manquants, autant ne pas stocker une chaîne vide.
  if (sourceFiche.length > 0) question.sourceFiche = sourceFiche;
  if (sourceVersion.length > 0) question.sourceVersion = sourceVersion;

  return { valide: true, question };
}

/** Raccourci pour l'éditeur : le message d'un champ donné, s'il y en a un. */
export function messagePour(erreurs: ErreurChamp[], champ: string): string | undefined {
  return erreurs.find((erreur) => erreur.champ === champ)?.message;
}
