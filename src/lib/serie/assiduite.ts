/**
 * L'assiduité : la semaine en cours, la série de jours d'affilée, le record.
 *
 * **Pourquoi aucun historique par jour.** Un document par utilisateur et par
 * jour, c'est mille documents par commercial sur trois ans, qui ne s'effacent
 * jamais — et surtout une requête de sept documents à chaque ouverture de
 * l'accueil, pour afficher sept pastilles. Ce que la maquette dessine tient
 * dans trois nombres et sept clés de jour : **un champ de taille constante**,
 * dans le document de progression que l'accueil lit déjà et que la fin de
 * série écrit déjà. Zéro document, zéro lecture, zéro écriture en plus.
 *
 * **Une série ne se rompt par aucune écriture.** Personne n'écrit le jour où
 * l'on ne joue pas. Le nombre en base signifie donc « la série *au*
 * `dernierJour` » ; celui qu'on affiche est **dérivé à la lecture**. Stocker un
 * zéro qui ne s'écrit jamais demanderait une tâche planifiée pour une
 * pastille. La semaine suit la même règle : purgée à l'écriture, filtrée à la
 * lecture — sans quoi une semaine passée s'afficherait comme la semaine en
 * cours jusqu'à la série suivante.
 *
 * **Le jour se calcule à Paris.** Ni en UTC, ni dans le fuseau de l'appareil :
 * sinon la frontière du jour bouge d'un commercial à l'autre, et « hier »
 * cesse d'être la même chose pour tout le monde.
 *
 * Module pur : aucune dépendance à Firestore ni à React, pour que le calcul se
 * teste sans charger la configuration.
 */

const FUSEAU = 'Europe/Paris';

/** Les sept lettres de la semaine, du lundi au dimanche. */
export const LETTRES_JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const;

export type Assiduite = {
  /** Dernier jour où une série a été menée à son terme, en `AAAA-MM-JJ`. */
  dernierJour: string;
  /** Jours consécutifs jusqu'à `dernierJour` inclus. Jamais zéro s'il existe. */
  serie: number;
  /** La plus longue série jamais atteinte. Ne redescend pas. */
  record: number;
  /** Les jours actifs de la semaine courante. Au plus sept entrées. */
  semaine: string[];
};

export function assiduiteVide(): Assiduite {
  return { dernierJour: '', serie: 0, record: 0, semaine: [] };
}

/**
 * La clé du jour d'un instant, à Paris.
 *
 * Assemblée depuis `formatToParts` plutôt que depuis une locale qui rendrait
 * déjà le bon ordre : une locale se choisit pour une langue, pas pour un
 * format, et celle qui arrange aujourd'hui peut changer de forme demain.
 */
export function clefDuJour(instant: Date): string {
  const parties = new Intl.DateTimeFormat('fr-FR', {
    timeZone: FUSEAU,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);

  const lire = (type: string) => parties.find((partie) => partie.type === type)?.value ?? '';
  return `${lire('year')}-${lire('month')}-${lire('day')}`;
}

/** Lundi à vendredi. Le rang 5 est le samedi, le rang 6 le dimanche. */
function estOuvre(clef: string): boolean {
  const jour = new Date(`${clef}T00:00:00Z`).getUTCDay();
  return jour >= 1 && jour <= 5;
}

/**
 * Aucun jour ouvré n'a été manqué entre ces deux jours.
 *
 * **C'est ce qui décide si une série continue, et le week-end n'y compte
 * pas.** La maquette neutralise samedi et dimanche — « rien à rattraper un
 * dimanche » — et on ne peut pas à la fois ne rien demander le week-end et
 * rompre la série parce qu'on n'a rien fait. Vendredi puis lundi, la série
 * tient ; vendredi puis mardi, elle repart.
 *
 * **Le défaut que cela corrige** : la première version comparait au jour
 * calendaire précédent. Un commercial qui travaille du lundi au vendredi
 * voyait sa série repartir à un chaque lundi et son record plafonner à cinq —
 * ce qui rendait « dix jours d'affilée » inatteignable.
 *
 * Jouer un samedi ne rompt rien et compte comme un jour joué : la série
 * compte les jours où l'on a joué, le calendrier ouvré ne décide que des
 * absences qui la brisent.
 */
export function serieContinue(precedent: string, aujourdhui: string): boolean {
  if (!precedent || precedent >= aujourdhui) return false;

  const debut = Date.parse(`${precedent}T00:00:00Z`);
  const fin = Date.parse(`${aujourdhui}T00:00:00Z`);
  // Au-delà de deux semaines, inutile de parcourir : un jour ouvré a été manqué.
  if (fin - debut > 14 * 86_400_000) return false;

  for (let instant = debut + 86_400_000; instant < fin; instant += 86_400_000) {
    if (estOuvre(new Date(instant).toISOString().slice(0, 10))) return false;
  }
  return true;
}

/** Les sept clés de la semaine qui contient ce jour, du lundi au dimanche. */
export function semaineDe(clef: string): string[] {
  const jour = new Date(`${clef}T00:00:00Z`);
  // getUTCDay rend 0 pour dimanche ; la semaine de travail commence le lundi.
  const depuisLundi = (jour.getUTCDay() + 6) % 7;
  const lundi = Date.parse(`${clef}T00:00:00Z`) - depuisLundi * 86_400_000;
  return Array.from({ length: 7 }, (_, rang) =>
    new Date(lundi + rang * 86_400_000).toISOString().slice(0, 10),
  );
}

/**
 * L'assiduité après une série menée à son terme.
 *
 * Deux séries le même jour ne comptent qu'une fois : c'est la régularité qui
 * est mesurée, pas le volume.
 */
export function apresUneSerie(courante: Assiduite, aujourdhui: string): Assiduite {
  const semaine = semaineDe(aujourdhui);
  const gardes = courante.semaine.filter((jour) => semaine.includes(jour));
  const misAJour = gardes.includes(aujourdhui) ? gardes : [...gardes, aujourdhui].sort();

  if (courante.dernierJour === aujourdhui) {
    return { ...courante, semaine: misAJour };
  }

  const serie = serieContinue(courante.dernierJour, aujourdhui) ? courante.serie + 1 : 1;

  return {
    dernierJour: aujourdhui,
    serie,
    record: Math.max(courante.record, serie),
    semaine: misAJour,
  };
}

/**
 * La série telle qu'elle doit s'afficher.
 *
 * Vivante tant que le dernier jour actif est aujourd'hui ou hier — la journée
 * n'est pas finie, la série non plus. Au-delà, elle est rompue, et aucune
 * écriture ne l'aura dit.
 */
export function serieAffichee(assiduite: Assiduite, aujourdhui: string): number {
  if (!assiduite.dernierJour) return 0;
  const vivante =
    assiduite.dernierJour === aujourdhui || serieContinue(assiduite.dernierJour, aujourdhui);
  return vivante ? assiduite.serie : 0;
}

export type JourDeSemaine = {
  clef: string;
  lettre: string;
  /** Une série a été terminée ce jour-là. */
  fait: boolean;
  /** Le jour n'est pas encore arrivé : ni fait, ni manqué. */
  aVenir: boolean;
  /**
   * Jour ouvré — du lundi au vendredi.
   *
   * **C'est lui qui décide du fond, pas le fait d'être passé.** La maquette
   * pose un fond neutre sur le samedi et le dimanche et un fond plein sur les
   * cinq autres : l'objectif est quotidien les jours ouvrés, et il n'y a rien
   * à rattraper un dimanche. Un vendredi pas encore arrivé se dessine donc
   * comme un lundi manqué — c'est voulu, la pastille dit « à faire », pas
   * « raté ».
   */
  ouvre: boolean;
};

/** Les sept jours de la semaine courante, avec leur état. */
export function semaineAffichee(assiduite: Assiduite, aujourdhui: string): JourDeSemaine[] {
  const jours = semaineDe(aujourdhui);
  return jours.map((clef, rang) => ({
    clef,
    lettre: LETTRES_JOURS[rang]!,
    fait: assiduite.semaine.includes(clef),
    aVenir: clef > aujourdhui,
    ouvre: rang < 5,
  }));
}
