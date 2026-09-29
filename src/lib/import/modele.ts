import type { Formation } from '@/lib/formations/lecture';
import { ANGLES, DESCRIPTIONS_ANGLE } from '@/lib/questions/angles';
import { LIBELLES_DIFFICULTE, PLAFONDS } from '@/lib/questions/modele';
import { COLONNES_MODELE, type Colonne } from '@/lib/import/colonnes';
import { FORMATS_PROPOSES, SEPARATEUR_VALEURS } from '@/lib/import/lignes';
import { ecrireClasseur, type Feuille, type ListeDeroulante } from '@/lib/import/classeur';

/**
 * Le modèle téléchargeable de l'écran d'import, en deux fichiers.
 *
 * **Deux fichiers, parce que deux lecteurs.** Une IA lit d'un bloc un texte qui
 * mêle consignes, catalogue et exemples : c'est le `.md`. Un tableur affiche
 * tout ce qu'on met dans sa première feuille comme des lignes à remplir — des
 * consignes en tête y deviennent des lignes à supprimer, et des exemples, des
 * questions importées par oubli. Le `.xlsx` garde donc sa première feuille
 * vide sous l'en-tête, et range le reste à côté.
 *
 * **Tout sort du référentiel, rien n'est écrit à la main.** Les noms et les
 * numéros des formations sont ceux du catalogue au moment du téléchargement :
 * un catalogue recopié serait faux dès la prochaine synchronisation. Les
 * exemples aussi en sont tirés — publics, durée, format, bloc de
 * certification —, ce qui les rend vrais par construction et importables tels
 * quels. Les angles « Contenu », « Expert » et « Arguments de vente » ne
 * s'inventent pas depuis des champs : ils sont décrits, pas illustrés.
 *
 * **Aucun exemple ne remplit la colonne `argumentaire`.** Le référentiel ne
 * contient aucun texte de vente, et une phrase écrite ici serait recopiée par
 * l'IA comme un modèle de ton. Le ton est celui de Noémie, pas celui de ce
 * fichier : la colonne est décrite, et l'exemple la laisse vide.
 *
 * Ce module ne lit rien. La route lui passe les formations actives.
 */

export type LigneModele = Record<Colonne, string>;

type DescriptionColonne = {
  obligatoire: string;
  contenu: string;
};

const TROIS_FORMATS = FORMATS_PROPOSES.map((format) => `« ${format.libelle} »`).join(', ');
const TROIS_DIFFICULTES = Object.values(LIBELLES_DIFFICULTE)
  .map((libelle) => `« ${libelle.toLowerCase()} »`)
  .join(', ');

const DESCRIPTIONS: Record<Colonne, DescriptionColonne> = {
  format: { obligatoire: 'oui', contenu: `Le format de la question : ${TROIS_FORMATS}.` },
  enonce: {
    obligatoire: 'oui',
    contenu: `La question posée au commercial. ${PLAFONDS.enonce} caractères au plus.`,
  },
  contexte: {
    obligatoire: 'pour une mise en situation',
    contenu:
      `La scène que le commercial lit avant de répondre. Obligatoire pour une mise en ` +
      `situation, vide sinon. ${PLAFONDS.contexte} caractères au plus.`,
  },
  reponses: {
    obligatoire: 'oui, sauf vrai ou faux',
    contenu:
      `Les propositions, séparées par « ${SEPARATEUR_VALEURS} ». Pour un vrai ou faux, laisser ` +
      `vide : « Vrai » et « Faux » sont posés d’office. ${PLAFONDS.optionTexte} caractères au ` +
      `plus par proposition.`,
  },
  bonnesReponses: {
    obligatoire: 'oui',
    contenu:
      `La ou les bonnes réponses : leur libellé exact, ou leur numéro (1 pour la première ` +
      `proposition). Plusieurs se séparent par « ${SEPARATEUR_VALEURS} ». Pour un vrai ou faux : ` +
      `« Vrai » ou « Faux ».`,
  },
  explication: {
    obligatoire: 'oui',
    contenu:
      `Pourquoi la réponse est juste. Elle s’affiche après chaque réponse, juste ou fausse. ` +
      `${PLAFONDS.explication} caractères au plus.`,
  },
  argumentaire: {
    obligatoire: 'non',
    contenu:
      `Ce que le commercial en dit au téléphone, en une phrase. Vide pour une question de ` +
      `pur fait : un argument inventé pour remplir la case est pire que rien. ` +
      `${PLAFONDS.argumentaire} caractères au plus.`,
  },
  formations: {
    obligatoire: 'oui',
    contenu:
      `Le numéro d’action DPC de la formation, recopié du catalogue. Plusieurs se séparent ` +
      `par « ${SEPARATEUR_VALEURS} ». Le nom est accepté, mais deux formations peuvent le ` +
      `partager : le numéro ne se trompe pas.`,
  },
  theme: {
    obligatoire: 'oui',
    contenu:
      `L’entrée de l’argumentaire sur laquelle la question porte : ` +
      `${ANGLES.map((angle) => `« ${angle} »`).join(', ')}. Un autre angle est accepté, ` +
      `avec un avertissement à l’import. ${PLAFONDS.theme} caractères au plus.`,
  },
  difficulte: {
    obligatoire: 'non',
    contenu: `${TROIS_DIFFICULTES}. Sans valeur, la question entre en « facile ».`,
  },
  sourceFiche: {
    obligatoire: 'non',
    contenu: `La fiche d’argumentaire d’où vient la question. ${PLAFONDS.sourceFiche} caractères au plus.`,
  },
  sourceVersion: {
    obligatoire: 'non',
    contenu:
      `La version de cette fiche, pour retrouver les questions à relire quand elle change. ` +
      `${PLAFONDS.sourceVersion} caractères au plus.`,
  },
};

/** Ce qu'on écrit dans « formations » : le numéro DPC, ou l'identifiant à défaut. */
export function referenceFormation(formation: Formation): string {
  return formation.numeroActionDpc || formation.id;
}

// --- Exemples ----------------------------------------------------------------

function ligneVide(): LigneModele {
  return Object.fromEntries(COLONNES_MODELE.map(({ colonne }) => [colonne, ''])) as LigneModele;
}

/**
 * Un libellé ne doit contenir ni le séparateur des valeurs, ni la virgule, que
 * la colonne des bonnes réponses accepte aussi comme séparateur. Une valeur du
 * référentiel qui en porte n'est pas prise en exemple.
 */
const utilisable = (valeur: string) =>
  valeur.trim().length > 0 && !valeur.includes(SEPARATEUR_VALEURS) && !valeur.includes(',');

/**
 * Une proposition ne peut pas être un nombre nu. L'import lit une bonne
 * réponse numérique comme un **numéro de proposition** : « 8 » parmi
 * « 10|11|8 » désigne la huitième, qui n'existe pas — et « 1 » parmi « 3|1|2 »
 * désigne la première, « 3 », sans un mot. Le référentiel donne la durée en
 * nombre nu et ne dit pas son unité : on ne l'invente pas, on ne la propose
 * pas. Constaté sur le vrai catalogue, que le catalogue de test ne reproduisait
 * pas.
 */
const proposable = (valeur: string) => utilisable(valeur) && !/^\s*\d+([.,]\d+)?\s*$/.test(valeur);

/** « Autres » n'est pas un public qu'on peut nommer dans une question. */
const publicNomme = (cible: string) => utilisable(cible) && cible.trim().toLowerCase() !== 'autres';

const libelleBloc = (bloc: string) => (/^\d+$/.test(bloc.trim()) ? `Bloc ${bloc.trim()}` : bloc.trim());

const trier = (valeurs: Iterable<string>) =>
  [...new Set(valeurs)].sort((a, b) => a.localeCompare(b, 'fr'));

/**
 * Une ou deux questions par format, chacune tirée d'une formation qui a les
 * champs nécessaires. Un exemple dont aucune formation ne remplit les
 * conditions est simplement omis : mieux vaut un exemple de moins qu'un
 * exemple faux.
 */
export function exemplesDeQuestions(formations: Formation[]): LigneModele[] {
  const exemples: LigneModele[] = [];
  const tousLesPublics = trier(formations.flatMap((formation) => formation.cibles.filter(publicNomme)));

  const publicsDe = (formation: Formation) => trier(formation.cibles.filter(publicNomme));
  const absentsDe = (formation: Formation) =>
    tousLesPublics.filter((cible) => !publicsDe(formation).includes(cible));

  const ajouter = (valeurs: Partial<LigneModele>) => exemples.push({ ...ligneVide(), ...valeurs });

  /*
   * Une formation déjà prise en exemple ne l'est de nouveau qu'à défaut
   * d'une autre : six exemples sur la même formation montreraient la forme,
   * mais laisseraient croire que le lot doit tourner autour d'elle.
   */
  const dejaPrises = new Set<string>();
  const choisir = (convient: (formation: Formation) => boolean) => {
    const choisie =
      formations.find((formation) => !dejaPrises.has(formation.id) && convient(formation)) ??
      formations.find(convient);
    if (choisie) dejaPrises.add(choisie.id);
    return choisie;
  };

  // --- Vrai ou faux, vrai : un public de la formation.
  const avecPublic = choisir((formation) => publicsDe(formation).length > 0);
  if (avecPublic) {
    const publics = publicsDe(avecPublic);
    ajouter({
      format: 'vrai ou faux',
      enonce: `« ${publics[0]} » fait partie du public de la formation « ${avecPublic.nom} ».`,
      bonnesReponses: 'Vrai',
      explication: `Le référentiel destine cette formation à : ${publics.join(', ')}.`,
      formations: referenceFormation(avecPublic),
      theme: 'Public et conditions',
      difficulte: 'facile',
    });
  }

  // --- Vrai ou faux, faux : un public qu'elle n'a pas.
  const avecAbsent = choisir(
    (formation) => publicsDe(formation).length > 0 && absentsDe(formation).length > 0,
  );
  if (avecAbsent) {
    const absent = absentsDe(avecAbsent)[0]!;
    ajouter({
      format: 'vrai ou faux',
      enonce: `« ${absent} » fait partie du public de la formation « ${avecAbsent.nom} ».`,
      bonnesReponses: 'Faux',
      explication:
        `Le référentiel destine cette formation à : ${publicsDe(avecAbsent).join(', ')}. ` +
        `« ${absent} » n’en fait pas partie.`,
      formations: referenceFormation(avecAbsent),
      theme: 'Public et conditions',
      difficulte: 'moyenne',
    });
  }

  // --- Choix multiples à plusieurs bonnes réponses : tous ses publics.
  const plurielle = choisir(
    (formation) => publicsDe(formation).length >= 2 && absentsDe(formation).length > 0,
  );
  if (plurielle) {
    const justes = publicsDe(plurielle).slice(0, 3);
    const leurres = absentsDe(plurielle).slice(0, 2);
    ajouter({
      format: 'choix multiples',
      enonce: `À quels publics la formation « ${plurielle.nom} » s’adresse-t-elle ?`,
      reponses: trier([...justes, ...leurres]).join(SEPARATEUR_VALEURS),
      bonnesReponses: justes.join(SEPARATEUR_VALEURS),
      explication:
        `Le référentiel la destine à : ${publicsDe(plurielle).join(', ')}. ` +
        `Il faut cocher tous ces publics, et eux seuls.`,
      formations: referenceFormation(plurielle),
      theme: 'Public et conditions',
      difficulte: 'moyenne',
    });
  }

  // --- Choix multiples à une bonne réponse : le bloc de certification.
  const tousLesBlocs = trier(
    formations.flatMap((formation) => formation.blocsCertification.filter(utilisable).map(libelleBloc)),
  );
  const certifiee = choisir(
    (formation) => formation.blocsCertification.filter(utilisable).length === 1,
  );
  if (certifiee && tousLesBlocs.length >= 2) {
    const bloc = libelleBloc(certifiee.blocsCertification.filter(utilisable)[0]!);
    ajouter({
      format: 'choix multiples',
      enonce: `À quel bloc de la certification périodique la formation « ${certifiee.nom} » se rattache-t-elle ?`,
      reponses: tousLesBlocs.slice(0, 4).includes(bloc)
        ? tousLesBlocs.slice(0, 4).join(SEPARATEUR_VALEURS)
        : [...tousLesBlocs.slice(0, 3), bloc].join(SEPARATEUR_VALEURS),
      bonnesReponses: bloc,
      explication: `Le référentiel rattache cette formation au ${bloc.toLowerCase()}.`,
      formations: referenceFormation(certifiee),
      theme: 'Certification',
      difficulte: 'moyenne',
    });
  }

  // --- Mise en situation : la durée.
  const toutesLesDurees = trier(formations.map((formation) => formation.dureeTotale).filter(proposable));
  const avecDuree = choisir((formation) => proposable(formation.dureeTotale));
  if (avecDuree && toutesLesDurees.length >= 2) {
    const juste = avecDuree.dureeTotale.trim();
    const leurres = toutesLesDurees.filter((duree) => duree !== juste).slice(0, 2);
    ajouter({
      format: 'mise en situation',
      contexte:
        `Un professionnel s’intéresse à la formation « ${avecDuree.nom} ». ` +
        `Avant d’aller plus loin, il veut savoir combien de temps il doit y consacrer.`,
      enonce: 'Quelle durée lui annoncez-vous ?',
      reponses: trier([juste, ...leurres]).join(SEPARATEUR_VALEURS),
      bonnesReponses: juste,
      explication: `La durée totale inscrite au référentiel est de ${juste}.`,
      formations: referenceFormation(avecDuree),
      theme: 'Public et conditions',
      difficulte: 'difficile',
    });
  }

  // --- Mise en situation : le format.
  const tousLesFormats = trier(formations.map((formation) => formation.format).filter(proposable));
  const avecFormat = choisir((formation) => proposable(formation.format));
  if (avecFormat && tousLesFormats.length >= 2) {
    const juste = avecFormat.format.trim();
    const leurres = tousLesFormats.filter((format) => format !== juste).slice(0, 2);
    ajouter({
      format: 'mise en situation',
      contexte: `Au téléphone, un professionnel vous demande comment se suit la formation « ${avecFormat.nom} ».`,
      enonce: 'Que lui répondez-vous ?',
      reponses: trier([juste, ...leurres]).join(SEPARATEUR_VALEURS),
      bonnesReponses: juste,
      explication: `Le référentiel la propose en « ${juste} ».`,
      formations: referenceFormation(avecFormat),
      theme: 'Public et conditions',
      difficulte: 'facile',
    });
  }

  return exemples;
}

// --- Consignes pour une IA ---------------------------------------------------

/** Une cellule CSV : toujours entre guillemets, guillemets internes doublés. */
const cellule = (valeur: string) => `"${valeur.replace(/"/g, '""')}"`;

function csv(lignes: LigneModele[]): string {
  const entete = COLONNES_MODELE.map(({ entete }) => cellule(entete)).join(',');
  const corps = lignes.map((ligne) =>
    COLONNES_MODELE.map(({ colonne }) => cellule(ligne[colonne])).join(','),
  );
  return [entete, ...corps].join('\n');
}

/** Une barre verticale dans un nom casserait le tableau Markdown. */
const celluleMarkdown = (valeur: string) => valeur.replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function consignesPourIa(formations: Formation[], maintenant: Date): string {
  const exemples = exemplesDeQuestions(formations);
  const date = maintenant.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  });

  return [
    '# Questions d’entraînement Médéré : consignes de rédaction',
    '',
    `Document produit le ${date}. Le catalogue en fin de document compte ${formations.length} ` +
      `formation${formations.length > 1 ? 's' : ''} active${formations.length > 1 ? 's' : ''}.`,
    '',
    'Vous rédigez des questions d’entraînement pour les commerciaux de Médéré, organisme de ' +
      'formation continue des professionnels de santé. Chaque question part de l’argumentaire ' +
      'd’une formation qui vous est fourni à part. Elle vérifie qu’un commercial connaît la ' +
      'formation assez bien pour en parler au téléphone.',
    '',
    '## Ce que vous rendez',
    '',
    '- Un tableau au format CSV, et rien d’autre : pas de phrase avant, pas de commentaire après.',
    '- Séparateur : la virgule. Chaque cellule entre guillemets doubles. Un guillemet dans un ' +
      'texte s’écrit deux fois : `""`.',
    '- Première ligne : l’en-tête ci-dessous, recopié exactement. Puis une question par ligne.',
    '- Une colonne facultative sans valeur reste présente, avec une cellule vide : `""`.',
    '',
    '```csv',
    COLONNES_MODELE.map(({ entete }) => cellule(entete)).join(','),
    '```',
    '',
    '## Les colonnes',
    '',
    '| Colonne | Obligatoire | Ce qu’elle contient |',
    '| --- | --- | --- |',
    ...COLONNES_MODELE.map(
      ({ colonne, entete }) =>
        `| \`${entete}\` | ${DESCRIPTIONS[colonne].obligatoire} | ${celluleMarkdown(DESCRIPTIONS[colonne].contenu)} |`,
    ),
    '',
    '## Les formats',
    '',
    '- **vrai ou faux** : une affirmation. `reponses` reste vide, `bonnesReponses` vaut ' +
      '`Vrai` ou `Faux`.',
    '- **choix multiples** : deux propositions ou plus, une ou plusieurs justes. Une réponse ' +
      'n’est juste que si le commercial coche exactement l’ensemble attendu : indiquez toutes ' +
      'les bonnes réponses, sans en oublier.',
    '- **mise en situation** : un choix multiples précédé d’une scène, dans `contexte`. ' +
      'La scène doit être nécessaire pour répondre.',
    '',
    '## Les angles',
    '',
    'La colonne `angle` dit sur quelle entrée de l’argumentaire la question porte. Le sujet, ' +
      'lui, est déjà dit par la formation. Employez l’une de ces cinq valeurs, écrites ' +
      'exactement ainsi :',
    '',
    ...ANGLES.map((angle) => `- **${angle}** : ${DESCRIPTIONS_ANGLE[angle]}.`),
    '',
    'Une question qui ne relève d’aucune des cinq reste acceptée : écrivez alors un angle ' +
      'court et explicite. Ne forcez pas une question dans un angle qui ne lui correspond pas.',
    '',
    '## Les valeurs multiples',
    '',
    `Dans \`reponses\`, \`bonnesReponses\` et \`formations\`, plusieurs valeurs se séparent par ` +
      `une barre verticale, sans espace obligatoire : \`Proposition A${SEPARATEUR_VALEURS}Proposition B\`. ` +
      `Aucun texte de proposition ne doit donc contenir de barre verticale, ni de virgule ` +
      `quand il sert de bonne réponse.`,
    '',
    'Une proposition n’est jamais un nombre seul : écrivez son unité (`8 heures`, `Bloc 2`, ' +
      '`3 ans`). Dans `bonnesReponses`, un nombre seul désigne le **numéro** de la proposition ' +
      '(1 pour la première), pas son texte.',
    '',
    '## Ce qu’il ne faut pas faire',
    '',
    '- N’inventez aucune formation. La colonne `formations` ne contient que des numéros du ' +
      'catalogue ci-dessous. Une question qui ne se rattache à aucune formation du catalogue ' +
      'ne s’écrit pas.',
    '- N’inventez aucun fait. Tout ce que la question affirme vient de l’argumentaire fourni.',
    '- N’inventez pas d’argumentaire. Laissez la colonne vide quand la question n’appelle ' +
      'rien à dire au téléphone.',
    '',
    '## Exemples',
    '',
    exemples.length > 0
      ? 'Ces lignes sont importables telles quelles. Elles sont tirées du référentiel, pas ' +
        'd’un argumentaire : leur fond est plus pauvre que celui attendu, leur forme est la bonne.'
      : 'Le catalogue ne contient pas encore de quoi construire un exemple.',
    '',
    ...(exemples.length > 0 ? ['```csv', csv(exemples), '```', ''] : []),
    '## Catalogue des formations actives',
    '',
    'Recopiez le numéro de la première colonne dans `formations`.',
    '',
    '| Numéro à recopier | Formation |',
    '| --- | --- |',
    ...formations.map(
      (formation) =>
        `| ${celluleMarkdown(referenceFormation(formation))} | ${celluleMarkdown(formation.nom)} |`,
    ),
    '',
  ].join('\n');
}

// --- Classeur pour un tableur ------------------------------------------------

const LARGEURS: Record<Colonne, number> = {
  format: 18,
  enonce: 48,
  contexte: 36,
  reponses: 40,
  bonnesReponses: 24,
  explication: 48,
  argumentaire: 40,
  formations: 18,
  theme: 22,
  difficulte: 12,
  sourceFiche: 24,
  sourceVersion: 14,
};

function listesDeroulantes(): ListeDeroulante[] {
  const position = (cherchee: Colonne) =>
    COLONNES_MODELE.findIndex(({ colonne }) => colonne === cherchee);

  return [
    {
      colonne: position('format'),
      valeurs: FORMATS_PROPOSES.map((format) => format.libelle),
      message: `Format inconnu de l’import. Choisissez ${TROIS_FORMATS}.`,
    },
    {
      colonne: position('theme'),
      valeurs: ANGLES,
      message:
        'Angle hors des cinq de l’argumentaire. Il sera accepté à l’import, avec un avertissement.',
    },
    {
      colonne: position('difficulte'),
      valeurs: Object.values(LIBELLES_DIFFICULTE).map((libelle) => libelle.toLowerCase()),
      message: `Difficulté inconnue de l’import. Choisissez ${TROIS_DIFFICULTES}.`,
    },
  ];
}

export const NOMS_FEUILLES = {
  questions: 'Questions',
  exemples: 'Exemples',
  formations: 'Formations',
  aide: 'Aide',
} as const;

export function classeurModele(formations: Formation[]): Uint8Array {
  const entete = COLONNES_MODELE.map(({ entete }) => entete);
  const largeurs = COLONNES_MODELE.map(({ colonne }) => LARGEURS[colonne]);
  const listes = listesDeroulantes();

  const feuilles: Feuille[] = [
    // La première feuille est celle que l'import lit par défaut : l'en-tête,
    // et rien d'autre à supprimer.
    { nom: NOMS_FEUILLES.questions, lignes: [entete], largeurs, listes },
    {
      nom: NOMS_FEUILLES.exemples,
      lignes: [
        entete,
        ...exemplesDeQuestions(formations).map((ligne) =>
          COLONNES_MODELE.map(({ colonne }) => ligne[colonne]),
        ),
      ],
      largeurs,
      listes,
    },
    {
      nom: NOMS_FEUILLES.formations,
      lignes: [
        ['Numéro à recopier', 'Formation'],
        ...formations.map((formation) => [referenceFormation(formation), formation.nom]),
      ],
      largeurs: [22, 80],
    },
    {
      nom: NOMS_FEUILLES.aide,
      lignes: [
        ['Colonne', 'Obligatoire', 'Ce qu’elle contient'],
        ...COLONNES_MODELE.map(({ colonne, entete: nom }) => [
          nom,
          DESCRIPTIONS[colonne].obligatoire,
          DESCRIPTIONS[colonne].contenu,
        ]),
        [],
        ['Angle', '', 'Ce qu’il recouvre'],
        ...ANGLES.map((angle) => [angle, '', `${DESCRIPTIONS_ANGLE[angle]}.`]),
        [],
        [
          'Valeurs multiples',
          '',
          `Plusieurs valeurs dans une cellule se séparent par « ${SEPARATEUR_VALEURS} ».`,
        ],
        [
          'Exemples',
          '',
          'La feuille « Exemples » s’importe telle quelle : choisissez-la dans le sélecteur de ' +
            'feuille de l’écran d’import pour voir à quoi ressemble un lot correct.',
        ],
      ],
      largeurs: [22, 24, 100],
    },
  ];

  return ecrireClasseur(feuilles);
}
