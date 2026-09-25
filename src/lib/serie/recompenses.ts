import type { NomPicto } from '@/composants/ds/Picto';
import { type Assiduite, semaineDe, serieAffichee } from '@/lib/serie/assiduite';

/**
 * Les récompenses : les paliers franchis sur le catalogue.
 *
 * **Deux systèmes, et il ne faut pas les confondre.** Les *prix* sont des
 * trophées d'un jeudi vécu — un classement, une séance, une date ; ils vivent
 * sous `users/{uid}/prix` et seule la Cloud Function les écrit. Les
 * *récompenses* sont des paliers d'assiduité et de maîtrise, individuels, sans
 * rapport avec une séance. Une récompense ne nomme jamais de séance ; un prix
 * en nomme toujours une.
 *
 * **Stockées, et non dérivées.** Sept des neuf se calculent depuis ce que
 * l'accueil charge déjà — mais une valeur dérivée se perd : « toutes les
 * formations au-dessus de 80 % » s'évanouirait le jour où une question de plus
 * est publiée. **Une récompense est un fait du passé, une valeur dérivée est un
 * fait du présent.** C'est la décision du lot 7 sur les prix, appliquée ici.
 *
 * **La croissance est bornée par construction** : une entrée par récompense
 * obtenue, dans une carte `recompenses` du document utilisateur, et la liste
 * des récompenses est cet ensemble fermé. Neuf entrées aujourd'hui, jamais une
 * par usage. Les règles plafonnent la carte et interdisent d'en retirer ou d'en
 * réécrire une entrée.
 *
 * Module pur : aucune dépendance à Firestore ni à React.
 */

/** Ce que l'écran sait déjà, au moment de juger un palier. */
export type Mesures = {
  /** Formations dont toutes les questions sont maîtrisées. */
  formationsMaitrisees: number;
  /** Formations au-dessus de 80 % de maîtrise. */
  formationsSolides: number;
  /** Formations portant au moins une question publiée. */
  formationsTotal: number;
  /** Mises en situation dont la dernière réponse est juste. */
  situationsJustes: number;
  /** Mises en situation déjà rencontrées. */
  situationsVues: number;
  /** Mises en situation dont la dernière réponse est fausse. */
  situationsRatees: number;
  /**
   * La série du moment — zéro si elle est rompue.
   *
   * **Pas le record.** « Dix jours d'affilée » se gagne en enchaînant dix
   * jours, et la jauge dit combien il en reste depuis aujourd'hui. Mesurée sur
   * le record, elle annonçait « encore 6 jours » à quelqu'un qui en avait
   * enchaîné quatre le mois dernier et deux cette semaine : il lui en restait
   * huit. Une jauge qui promet un palier plus proche qu'il ne l'est est pire
   * qu'aucune jauge.
   */
  serieJours: number;
  /** Jours actifs de la semaine **en cours** — ceux de la semaine passée n'y comptent pas. */
  joursActifsCetteSemaine: number;
};

export type Jauge = {
  valeur: number;
  objectif: number;
  /** Ce qu'il reste à faire, en une phrase courte. Vide si le palier est atteint. */
  reste: string;
};

export type Recompense = {
  id: string;
  libelle: string;
  picto: NomPicto;
  /**
   * Teinte du médaillon.
   *
   * **Jamais une teinte de médaille.** Turquoise, jaune et argent sont
   * réservés aux prix de séance : deux systèmes qui partagent une couleur sont
   * deux systèmes qu'on confond d'un coup d'œil.
   */
  teinte: string;
  /**
   * Comment on s'en approche — ou `null` quand la récompense s'accorde à un
   * évènement que l'accueil ne peut pas rejouer : une première séance
   * collective, une série parfaite. Celles-là ne s'affichent qu'une fois
   * obtenues, et elles arrivent dans la carte par l'écriture qui les constate.
   */
  jauge: ((mesures: Mesures) => Jauge) | null;
};

const restant = (manque: number, mot: string, pluriel = `${mot}s`) =>
  `encore ${manque} ${manque > 1 ? pluriel : mot}`;

export const RECOMPENSES: Recompense[] = [
  {
    id: 'formation-maitrisee',
    libelle: 'Une formation entièrement maîtrisée',
    picto: 'distinction',
    teinte: '#F19953',
    jauge: (m) => ({
      valeur: m.formationsMaitrisees,
      objectif: 1,
      reste: m.formationsMaitrisees >= 1 ? '' : 'aucune formation complète',
    }),
  },
  {
    id: 'catalogue-solide',
    libelle: 'Toutes les formations au-dessus de 80 %',
    picto: 'dentaire',
    teinte: '#9F84BD',
    jauge: (m) => ({
      valeur: m.formationsSolides,
      objectif: m.formationsTotal,
      reste:
        m.formationsTotal === 0
          ? 'aucune formation au catalogue'
          : m.formationsSolides >= m.formationsTotal
            ? ''
            : `${m.formationsSolides} sur ${m.formationsTotal}`,
    }),
  },
  {
    id: 'dix-situations',
    libelle: 'Dix mises en situation justes',
    picto: 'soin',
    teinte: '#D87DA9',
    jauge: (m) => ({
      valeur: m.situationsJustes,
      objectif: 10,
      reste: m.situationsJustes >= 10 ? '' : `${m.situationsJustes} sur 10`,
    }),
  },
  {
    id: 'situations-sans-faute',
    libelle: 'Aucune erreur sur les mises en situation',
    picto: 'question',
    teinte: '#006E90',
    /*
     * Le palier demande dix mises en situation vues *et* aucune ratée : sans le
     * plancher, il serait acquis d'avance par qui n'en a jamais vu une seule.
     */
    jauge: (m) => ({
      valeur: m.situationsRatees === 0 ? m.situationsVues : 0,
      objectif: 10,
      reste:
        m.situationsRatees > 0
          ? `${m.situationsRatees} ratée${m.situationsRatees > 1 ? 's' : ''} à reprendre`
          : m.situationsVues >= 10
            ? ''
            : `${m.situationsVues} sur 10 vues`,
    }),
  },
  {
    id: 'dix-jours',
    libelle: 'Dix jours d’affilée',
    picto: 'regularite',
    teinte: '#2DA131',
    jauge: (m) => ({
      valeur: m.serieJours,
      objectif: 10,
      reste: m.serieJours >= 10 ? '' : restant(10 - m.serieJours, 'jour'),
    }),
  },
  {
    id: 'vingt-jours',
    libelle: 'Vingt jours d’affilée',
    picto: 'calendrier',
    teinte: '#302D2D',
    jauge: (m) => ({
      valeur: m.serieJours,
      objectif: 20,
      reste: m.serieJours >= 20 ? '' : restant(20 - m.serieJours, 'jour'),
    }),
  },
  {
    id: 'semaine-pleine',
    libelle: 'Cinq jours actifs dans la semaine',
    picto: 'suivi',
    teinte: '#F19953',
    jauge: (m) => ({
      valeur: m.joursActifsCetteSemaine,
      objectif: 5,
      reste:
        m.joursActifsCetteSemaine >= 5
          ? ''
          : `${m.joursActifsCetteSemaine} sur 5 cette semaine`,
    }),
  },
  {
    id: 'serie-parfaite',
    libelle: 'Une série sans faute',
    picto: 'distinction',
    teinte: '#9F84BD',
    jauge: null,
  },
  {
    id: 'premiere-seance',
    libelle: 'Première séance collective',
    picto: 'professions',
    teinte: '#006E90',
    jauge: null,
  },
];

/**
 * Les mesures de catalogue, depuis ce que l'écran a déjà en main.
 *
 * **Deux formes minimales en entrée, et rien de plus** : l'appelant fait la
 * jointure entre les questions et les états, ce module compte. C'est ce qui le
 * garde pur — et testable sans charger la configuration Firebase.
 *
 * Les deux mesures qui manquent — la série et les jours actifs — viennent de
 * l'assiduité, par `mesurerAssiduite`.
 */
export function mesurerCatalogue(
  avancements: { maitrise: { pourcentage: number } }[],
  situations: { dejaVue: boolean; derniereRatee: boolean }[],
): Omit<Mesures, 'serieJours' | 'joursActifsCetteSemaine'> {
  const vues = situations.filter((situation) => situation.dejaVue);

  return {
    formationsMaitrisees: avancements.filter((a) => a.maitrise.pourcentage === 100).length,
    formationsSolides: avancements.filter((a) => a.maitrise.pourcentage >= 80).length,
    formationsTotal: avancements.length,
    situationsJustes: vues.filter((situation) => !situation.derniereRatee).length,
    situationsVues: vues.length,
    situationsRatees: vues.filter((situation) => situation.derniereRatee).length,
  };
}

/** Identifiants connus du code. Une clé inconnue en base ne rend rien. */
export const IDS_RECOMPENSES = RECOMPENSES.map((recompense) => recompense.id);

/**
 * Les paliers atteints par la mesure, à cet instant.
 *
 * Ne contient jamais les récompenses d'évènement : elles ne se mesurent pas,
 * elles se constatent au moment où elles arrivent.
 */
/**
 * Les mesures d'assiduité, **telles qu'elles valent aujourd'hui**.
 *
 * Le document ne se corrige qu'à la série suivante : une série rompue garde
 * son compte, et `semaine` garde les jours de la semaine passée jusqu'au
 * prochain jour joué. Les lire brutes, c'est annoncer un lundi matin « 4 sur 5
 * cette semaine » à qui n'a encore rien fait. D'où ce passage obligé, pour
 * l'écran comme pour le crédit — qui l'appelle, lui, **après** avoir compté le
 * jour du jour.
 */
export function mesurerAssiduite(
  assiduite: Assiduite,
  aujourdhui: string,
): Pick<Mesures, 'serieJours' | 'joursActifsCetteSemaine'> {
  const semaine = semaineDe(aujourdhui);
  return {
    serieJours: serieAffichee(assiduite, aujourdhui),
    joursActifsCetteSemaine: assiduite.semaine.filter((jour) => semaine.includes(jour)).length,
  };
}

export function paliersAtteints(mesures: Mesures): string[] {
  return RECOMPENSES.filter((recompense) => {
    if (!recompense.jauge) return false;
    const jauge = recompense.jauge(mesures);
    return jauge.objectif > 0 && jauge.valeur >= jauge.objectif;
  }).map((recompense) => recompense.id);
}

/**
 * La carte des récompenses, enrichie des nouvelles.
 *
 * **Rien ne s'y réécrit.** Une récompense déjà obtenue garde sa date : c'est le
 * jour où elle a été gagnée, pas le dernier jour où on l'a re-méritée. Les
 * règles interdisent la même chose côté serveur, pour que ce ne soit pas qu'une
 * politesse du client.
 */
export function avecNouvelles(
  deja: Record<string, string>,
  atteintes: string[],
  jour: string,
): Record<string, string> {
  const carte = { ...deja };
  for (const id of atteintes) {
    if (!carte[id]) carte[id] = jour;
  }
  return carte;
}

/** Ce que l'écran affiche : chaque récompense, obtenue ou non, dans l'ordre. */
export type RecompenseVue = Recompense & {
  /** Jour d'obtention en `AAAA-MM-JJ`, ou `null` si le palier n'est pas franchi. */
  obtenueLe: string | null;
  jaugeVue: Jauge | null;
};

export function vueDesRecompenses(
  carte: Record<string, string>,
  mesures: Mesures,
): RecompenseVue[] {
  return RECOMPENSES.map((recompense) => ({
    ...recompense,
    obtenueLe: carte[recompense.id] ?? null,
    jaugeVue: recompense.jauge ? recompense.jauge(mesures) : null,
  }));
}
