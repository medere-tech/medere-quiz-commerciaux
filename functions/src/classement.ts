/**
 * Classement d'une séance collective, et prix qui en découlent.
 *
 * **Le tableau meurt avec la séance, le trophée reste.** Le classement est
 * nominatif et lisible par ceux qui étaient là ; le prix est privé, durable, et
 * ne s'agrège à rien. Rien de ce qui est calculé ici n'entre dans
 * `questionStats` : les statistiques disent quelles questions font trébucher
 * l'équipe, jamais qui a gagné.
 *
 * **Aucun client n'écrit ces documents**, pas même son propriétaire. Un prix
 * qu'on peut s'attribuer ne vaut rien.
 */

/** Ce qu'on retient d'une réponse de séance pour classer. */
export type ReponseSeance = {
  uid: string;
  questionId: string;
  correcte: boolean;
  /** Millisecondes depuis l'époque. Sert uniquement à départager. */
  repondueLe: number;
};

/** Une ligne du bilan : ce qu'une question a produit, sans dire chez qui. */
export type LigneBilan = {
  questionId: string;
  reponses: number;
  echecs: number;
};

export type Distinction = 'diamant' | 'or' | 'argent';

export type Rang = {
  uid: string;
  nom: string;
  /** Teinte choisie par la personne, recopiée du marqueur de présence. */
  avatar: string;
  justes: number;
  rang: number;
  /** Absente au-delà du podium. Le rang, lui, existe toujours. */
  distinction: Distinction | null;
};

const PODIUM: Distinction[] = ['diamant', 'or', 'argent'];

/**
 * Classe les participants d'une séance.
 *
 * **Aux points, et rien d'autre.** Le nombre de bonnes réponses décide. À
 * égalité, c'est la vitesse qui départage : on somme les instants de réponse,
 * et celui qui a répondu le plus tôt passe devant. Une séance où l'on gagne à
 * la vitesse autant qu'à la justesse est une séance où l'on répond au lieu
 * d'attendre — c'est exactement le rythme qu'on cherche.
 *
 * **Le podium récompense un rang, pas une performance absolue.** Le premier a
 * le Diamant, le deuxième l'Or, le troisième l'Argent, sans condition de score.
 * Dans une finale de cent mètres, le premier prend l'or même s'il court en
 * seize secondes. S'il n'y a que deux participants, il n'y a que deux
 * distinctions.
 *
 * **Tout le monde reçoit un rang**, y compris quatrième et au-delà. Le podium
 * est public, le rang est privé : chacun retrouve le sien dans son historique,
 * personne d'autre ne le voit.
 *
 * Un participant présent mais qui n'a jamais répondu n'apparaît pas : il n'a
 * pas joué.
 */
export function classer(
  reponses: ReponseSeance[],
  /** Nom et teinte, par uid, tels que publiés par les participants. */
  identites: Map<string, { nom: string; avatar: string }>,
): Rang[] {
  const cumuls = new Map<string, { justes: number; instants: number }>();

  for (const reponse of reponses) {
    const cumul = cumuls.get(reponse.uid) ?? { justes: 0, instants: 0 };
    if (reponse.correcte) cumul.justes += 1;
    cumul.instants += reponse.repondueLe;
    cumuls.set(reponse.uid, cumul);
  }

  const ordonnes = [...cumuls.entries()].sort(([uidA, a], [uidB, b]) => {
    if (b.justes !== a.justes) return b.justes - a.justes;
    if (a.instants !== b.instants) return a.instants - b.instants;
    // Dernier recours, pour que deux séances identiques donnent le même
    // classement : un tri stable ne se laisse pas à l'ordre d'arrivée.
    return uidA.localeCompare(uidB);
  });

  return ordonnes.map(([uid, cumul], index) => {
    const rang = index + 1;
    const distinction = rang <= PODIUM.length ? (PODIUM[rang - 1] as Distinction) : null;

    const identite = identites.get(uid);

    return {
      uid,
      nom: identite?.nom ?? 'Participant',
      avatar: identite?.avatar ?? 'encre',
      justes: cumul.justes,
      rang,
      distinction,
    };
  });
}

/**
 * Ce qui manquait pour la distinction suivante, en bonnes réponses.
 *
 * **La seule ligne de l'écran qui fasse revenir jeudi prochain.** Six
 * participants sur neuf ne gagnent rien ; leur dire « il vous manquait une
 * bonne réponse » vaut mieux que de leur dire qu'ils ont perdu. Rend `null`
 * quand la personne est déjà sur le podium, ou quand l'écart n'a pas de sens.
 */
export function ecartAuPodium(rangs: Rang[], uid: string): number | null {
  const moi = rangs.find((rang) => rang.uid === uid);
  if (!moi || moi.distinction !== null) return null;

  const dernierDuPodium = rangs.filter((rang) => rang.distinction !== null).at(-1);
  if (!dernierDuPodium) return null;

  const manque = dernierDuPodium.justes - moi.justes;
  // À égalité de points, c'est la vitesse qui a tranché : annoncer « zéro
  // bonne réponse d'écart » serait exact et incompréhensible.
  return manque > 0 ? manque : null;
}

/**
 * Bilan anonyme d'une séance : ce qui a été posé, et ce qui a trébuché.
 *
 * **Aucun identifiant n'en sort.** Deux compteurs par question, et rien
 * d'autre. C'est ce dont l'animatrice a besoin pour préparer la séance
 * suivante — ce qui a trébuché la semaine dernière détermine ce qu'elle repose
 * — et c'est tout ce qu'elle peut en savoir une fois la séance close : la
 * lecture nominative des votes s'éteint avec la séance.
 *
 * L'ordre suit celui des questions de la séance, pas celui des réponses : un
 * bilan se lit dans l'ordre où les questions ont été posées.
 */
export function bilanDesReponses(
  reponses: ReponseSeance[],
  questionIds: string[],
): LigneBilan[] {
  const comptes = new Map<string, { reponses: number; echecs: number }>();

  for (const reponse of reponses) {
    const compte = comptes.get(reponse.questionId) ?? { reponses: 0, echecs: 0 };
    compte.reponses += 1;
    if (!reponse.correcte) compte.echecs += 1;
    comptes.set(reponse.questionId, compte);
  }

  return questionIds.map((questionId) => ({
    questionId,
    ...(comptes.get(questionId) ?? { reponses: 0, echecs: 0 }),
  }));
}
