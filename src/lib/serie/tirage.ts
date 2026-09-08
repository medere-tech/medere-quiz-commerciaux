/**
 * Tirage d'une série, README section 5.
 *
 * **Pourquoi pondérer plutôt que trier.** Un tri par priorité servirait
 * toujours les mêmes questions dans le même ordre : le commercial apprendrait
 * la position autant que la réponse, et les questions bien maîtrisées ne
 * reviendraient jamais assez pour tenir. Le hasard pondéré garde la surprise
 * tout en donnant six fois plus de chances à une question ratée qu'à une
 * question jamais vue.
 *
 * **Sans remise.** Une même question ne peut pas sortir deux fois dans une
 * série. S'il n'y a pas dix questions disponibles, la série est plus courte —
 * jamais répétée. Répéter donnerait un score faussé et l'impression que
 * l'outil tourne à vide.
 */

export const TAILLE_SERIE = 10;

/**
 * Ce que la pondération produit, dit en une phrase pour l'écran.
 *
 * **Pourquoi une question déjà réussie deux fois revient encore.** Son poids
 * tombe à 0,4, pas à zéro. À zéro, la banque s'épuiserait : une fois tout
 * réussi deux fois, il n'y aurait plus rien à tirer et l'entraînement
 * s'arrêterait. À 0,4 elle réapparaît rarement, et c'est de l'entretien.
 * Faute de le dire, un commercial qui revoit une question maîtrisée en
 * conclut que l'outil tourne en rond.
 *
 * La phrase vit ici, contre `poids`, pour qu'on ne puisse pas changer les
 * poids sans voir le texte qui les annonce.
 */
export const LIBELLE_PONDERATION =
  'Les questions ratées reviennent en priorité, celles que vous maîtrisez réapparaissent rarement pour entretenir.';

/**
 * Générateur pseudo-aléatoire à graine (mulberry32).
 *
 * **Pourquoi ne pas prendre `Math.random` directement.** Une série doit
 * pouvoir être recalculée à l'identique : l'écran la dérive de son état, et
 * React se réserve le droit de rejouer un calcul mémoïsé. Avec `Math.random`,
 * un recalcul rebattrait les questions au milieu de la série. Avec une graine
 * tirée une fois et conservée, le même tirage ressort toujours.
 *
 * Il sert aussi aux tests, qui n'ont pas à composer des suites à la main.
 */
export function generateurAleatoire(graine: number): () => number {
  let etat = graine >>> 0;

  return () => {
    etat = (etat + 0x6d2b79f5) >>> 0;
    let melange = Math.imul(etat ^ (etat >>> 15), 1 | etat);
    melange = (melange + Math.imul(melange ^ (melange >>> 7), 61 | melange)) ^ melange;
    return ((melange ^ (melange >>> 14)) >>> 0) / 4294967296;
  };
}

/** Graine neuve, pour une nouvelle série. */
export function graineNeuve(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/** Ce que le tirage sait d'une question, et rien de plus. */
export type EtatQuestion = {
  id: string;
  /** Nombre de tentatives réussies, toutes tentatives confondues. */
  reussies: number;
  /** Vrai si la dernière tentative est un échec. */
  derniereRatee: boolean;
  /** Faux tant qu'aucune tentative n'a été enregistrée. */
  dejaVue: boolean;
};

/**
 * Poids exacts du README. Ils ne se déduisent pas d'une formule : ce sont
 * quatre décisions pédagogiques, et l'ordre des tests compte.
 */
export function poids(etat: EtatQuestion): number {
  if (!etat.dejaVue) return 3;
  if (etat.derniereRatee) return 6;
  if (etat.reussies >= 2) return 0.4;
  return 1.2;
}

/**
 * Tirage pondéré sans remise.
 *
 * @param hasard Injecté pour que les tests soient déterministes. En
 *   production, `Math.random`.
 */
export function tirerSerie(
  etats: EtatQuestion[],
  taille: number = TAILLE_SERIE,
  hasard: () => number = Math.random,
): string[] {
  const restants = etats.map((etat) => ({ id: etat.id, poids: poids(etat) }));
  const tires: string[] = [];

  while (tires.length < taille && restants.length > 0) {
    const total = restants.reduce((somme, candidat) => somme + candidat.poids, 0);
    if (total <= 0) break;

    let seuil = hasard() * total;
    let position = restants.length - 1;

    for (let index = 0; index < restants.length; index += 1) {
      seuil -= restants[index]!.poids;
      if (seuil <= 0) {
        position = index;
        break;
      }
    }

    tires.push(restants[position]!.id);
    restants.splice(position, 1);
  }

  return tires;
}

/**
 * Série de rattrapage : uniquement les questions dont la dernière tentative
 * est un échec, dans un ordre aléatoire — sans pondération, puisqu'elles
 * partagent toutes la même raison d'être là.
 */
export function tirerRattrapage(
  etats: EtatQuestion[],
  taille: number = TAILLE_SERIE,
  hasard: () => number = Math.random,
): string[] {
  const ratees = etats.filter((etat) => etat.derniereRatee).map((etat) => etat.id);

  // Mélange de Fisher-Yates : chaque ordre a la même probabilité.
  for (let index = ratees.length - 1; index > 0; index -= 1) {
    const autre = Math.floor(hasard() * (index + 1));
    [ratees[index], ratees[autre]] = [ratees[autre]!, ratees[index]!];
  }

  return ratees.slice(0, taille);
}
