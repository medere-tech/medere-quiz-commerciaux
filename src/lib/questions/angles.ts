import { normaliserEntete } from '@/lib/import/colonnes';

/**
 * Les angles d'une question : ce que le champ `theme` porte réellement.
 *
 * **Le sujet est porté par les formations, l'angle par ce champ.** Noémie
 * construit ses questions à partir d'un argumentaire de formation, et un
 * argumentaire a toujours les mêmes cinq entrées. Tant que le champ restait du
 * texte libre, chaque lot inventait sa nomenclature — « publics », « Public
 * cible », « cible » —, et une IA ne savait pas quoi y mettre.
 *
 * **Une liste ouverte, pas une liste fermée.** Les cinq valeurs sont proposées
 * partout où l'on écrit un angle, et une variante reconnue est ramenée à sa
 * forme canonique. Mais un angle hors liste passe, avec un avertissement : une
 * question qui ne rentre dans aucune des cinq entrées reste une question
 * légitime, et la refuser pousserait à la ranger au mauvais endroit.
 *
 * **Le nom du champ reste `theme` en base.** Seul le libellé a changé. Le
 * renommer toucherait les règles, les statistiques et les index pour un gain
 * nul : la base ne voit jamais le mot.
 *
 * La liste vit ici, dans le code. Un sixième angle se demande, il ne
 * s'ajoute pas depuis un écran.
 */

export const ANGLES = [
  'Contenu',
  'Expert',
  'Public et conditions',
  'Certification',
  'Arguments de vente',
] as const;

export type Angle = (typeof ANGLES)[number];

/** Ce que chaque angle recouvre, pour l'IA comme pour la personne qui remplit le tableau. */
export const DESCRIPTIONS_ANGLE: Record<Angle, string> = {
  Contenu: 'ce que la formation enseigne : programme, objectifs, compétences travaillées',
  Expert: 'qui a conçu ou anime la formation, et ce qui fait sa légitimité',
  'Public et conditions':
    'à qui elle s’adresse, sous quel format, pour quelle durée, avec quelle prise en charge',
  Certification: 'le bloc de certification périodique auquel elle se rattache',
  'Arguments de vente': 'ce qui la distingue et ce qu’on en dit au téléphone',
};

/**
 * Variantes reconnues, sous leur forme comparable (sans accent, sans casse,
 * sans ponctuation). La forme canonique est reconnue d'office.
 *
 * On y met ce qu'une personne ou une IA écrit spontanément pour désigner le
 * même angle — pas des synonymes lointains. Une variante trop large ferait
 * passer pour reconnu un angle qu'elle ne désignait pas.
 */
const VARIANTES: Record<Angle, string[]> = {
  Contenu: ['contenu', 'contenus', 'le contenu', 'programme', 'objectifs', 'objectifs pedagogiques'],
  Expert: [
    'expert',
    'experte',
    'l expert',
    'l experte',
    'experts',
    'formateur',
    'formatrice',
    'intervenant',
    'intervenante',
  ],
  'Public et conditions': [
    'public',
    'publics',
    'public cible',
    'cible',
    'cibles',
    'conditions',
    'public conditions',
    'public et conditions',
    'le public et les conditions',
  ],
  Certification: [
    'certification',
    'certification periodique',
    'bloc',
    'blocs',
    'bloc de certification',
    'blocs de certification',
    'le bloc de certification',
  ],
  'Arguments de vente': [
    'arguments de vente',
    'argument de vente',
    'arguments',
    'vente',
    'les arguments de vente',
  ],
};

const ANGLE_PAR_VARIANTE = new Map<string, Angle>(
  ANGLES.flatMap((angle) =>
    [angle, ...VARIANTES[angle]].map((variante) => [normaliserEntete(variante), angle] as const),
  ),
);

/** L'angle canonique que désigne ce texte, ou `undefined` s'il n'en désigne aucun. */
export function reconnaitreAngle(ecrit: string): Angle | undefined {
  return ANGLE_PAR_VARIANTE.get(normaliserEntete(ecrit));
}
