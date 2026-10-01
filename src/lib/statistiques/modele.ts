/**
 * Le taux d'échec d'une question, et d'où il vient.
 *
 * **Une seule source : les états des commerciaux.** Chaque réponse incrémente,
 * dans le même lot atomique, `tentatives` et `reussies` sur
 * `users/{uid}/etats/{questionId}`. Additionner ces deux compteurs sur les
 * commerciaux suivis donne le taux de la question — la même population que la
 * maîtrise et que la répartition des réponses, lue par la même fonction.
 *
 * **Pourquoi plus de `questionStats`.** L'ancien agrégat était un compteur qui
 * ne faisait que monter : un compte supprimé, un commercial passé
 * administrateur, une réponse effacée par un nettoyage y restaient comptés.
 * Le 1er octobre 2026, l'écran d'une question affichait « 0 réponse » dans sa
 * répartition et « 14 réponses » dans son taux. Les états, eux, partent avec
 * leur compte, ne suivent que les commerciaux, et leur volume plafonne au
 * nombre de commerciaux par le nombre de questions vues — là où l'historique
 * des réponses grossit sans fin.
 *
 * **Aucun identifiant d'utilisateur n'en sort.** Ce module ne reçoit que des
 * compteurs par question et ne rend que leurs totaux : l'affichage reste
 * anonyme par construction, c'est la règle qui compte.
 */

export type StatsQuestion = {
  questionId: string;
  tentatives: number;
  echecs: number;
};

/** Ce qu'il faut d'un état pour le compter, et rien de plus. */
export type CompteurEtat = { tentatives: number; reussies: number };

function entierPositif(valeur: number): number {
  return Number.isFinite(valeur) && valeur > 0 ? Math.floor(valeur) : 0;
}

/**
 * Les totaux par question, sur les états de plusieurs comptes.
 *
 * Chaque élément est l'ensemble des états d'un compte, indexé par question.
 * Le compte lui-même n'est jamais transmis : la fonction ne saurait pas le
 * rendre.
 */
export function agregerEtats(comptes: Iterable<ReadonlyMap<string, CompteurEtat>>): StatsQuestion[] {
  const totaux = new Map<string, StatsQuestion>();

  for (const etats of comptes) {
    for (const [questionId, etat] of etats) {
      const tentatives = entierPositif(etat.tentatives);
      if (tentatives === 0) continue;
      // Un état ne peut pas compter plus d'échecs que de tentatives. Si cela
      // arrive, c'est une anomalie d'écriture : on la borne plutôt que
      // d'afficher un taux supérieur à cent pour cent.
      const echecs = Math.min(tentatives, entierPositif(tentatives - entierPositif(etat.reussies)));
      const total = totaux.get(questionId) ?? { questionId, tentatives: 0, echecs: 0 };
      total.tentatives += tentatives;
      total.echecs += echecs;
      totaux.set(questionId, total);
    }
  }

  return [...totaux.values()];
}
