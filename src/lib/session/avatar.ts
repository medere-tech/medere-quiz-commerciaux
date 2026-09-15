/**
 * Avatars des commerciaux.
 *
 * **Une pastille de couleur portant les initiales, et rien d'autre.** C'est ce
 * que font Slack, Discord, Notion, et c'est le choix le plus lisible à
 * plusieurs mètres : un disque de couleur pleine se reconnaît du fond de la
 * salle, deux lettres blanches à fort contraste se lisent juste après.
 *
 * **Ce que j'ai essayé et écarté.** Le système de marque livre huit pictos —
 * ruban, calendrier, dent, cœur, tracé cardiaque… — qui auraient fait des
 * avatars plus amusants. Ils sont dessinés en 56 × 56 avec des traits fins et
 * des contre-formes serrées : réduits au diamètre d'une pastille de classement,
 * ils deviennent une tache grise. Les sept formes de la marque, elles, sont
 * déjà le repère d'une formation ; s'en servir aussi pour les personnes
 * rendrait les deux illisibles.
 *
 * **Une bibliothèque d'illustrations reste à demander au design** si l'on veut
 * aller plus loin. Ce module tient la promesse — se reconnaître d'un coup
 * d'œil — sans inventer un vocabulaire visuel que les maquettes ne couvrent
 * pas.
 *
 * Les huit teintes sont celles de la palette de marque. Elles ne désignent
 * aucune spécialité ici : ce sont des couleurs, choisies pour se distinguer les
 * unes des autres.
 */

export const AVATARS = {
  bleu: { libelle: 'Bleu', fond: '#006E90', encre: '#ffffff' },
  turquoise: { libelle: 'Turquoise', fond: '#17BEBB', encre: '#04302f' },
  vert: { libelle: 'Vert', fond: '#2DA131', encre: '#ffffff' },
  jaune: { libelle: 'Jaune', fond: '#FECA45', encre: '#4a3a05' },
  orange: { libelle: 'Orange', fond: '#F19953', encre: '#43260c' },
  rose: { libelle: 'Rose', fond: '#D87DA9', encre: '#41172c' },
  violet: { libelle: 'Violet', fond: '#9F84BD', encre: '#241a2e' },
  encre: { libelle: 'Encre', fond: '#022020', encre: '#ffffff' },
} as const;

export type CleAvatar = keyof typeof AVATARS;

export const CLES_AVATAR = Object.keys(AVATARS) as CleAvatar[];

export const AVATAR_PAR_DEFAUT: CleAvatar = 'encre';

/** Vrai pour une clé connue. Tout le reste retombe sur le défaut. */
export function estCleAvatar(valeur: unknown): valeur is CleAvatar {
  return typeof valeur === 'string' && Object.prototype.hasOwnProperty.call(AVATARS, valeur);
}

export function avatarOuDefaut(valeur: unknown): CleAvatar {
  return estCleAvatar(valeur) ? valeur : AVATAR_PAR_DEFAUT;
}

/**
 * Les initiales affichées dans la pastille.
 *
 * Deux lettres au plus : à trois, elles ne sont plus lisibles de loin. Le nom
 * vient de celui que la personne a choisi pour la séance, donc elle contrôle
 * déjà ce qui s'affiche.
 */
export function initiales(nom: string): string {
  const mots = nom
    .split(/[\s-]+/)
    .map((mot) => mot.trim())
    .filter((mot) => mot !== '');

  const premier = mots[0];
  if (premier === undefined) return '?';

  const second = mots[1];
  if (second === undefined) return premier.slice(0, 2).toUpperCase();

  return (premier.slice(0, 1) + second.slice(0, 1)).toUpperCase();
}
