import type { Formation } from '@/lib/formations/depot';
import type { Question } from '@/lib/questions/depot';
import type { EtatQuestion } from '@/lib/serie/tirage';

/**
 * Ce que « maîtriser » veut dire ici.
 *
 * Une question est maîtrisée quand sa **dernière** tentative est juste. Pas
 * quand elle a été réussie une fois : rater aujourd'hui ce qu'on savait le
 * mois dernier, c'est ne plus le savoir. C'est la même logique que la
 * pondération du tirage, qui fait remonter le dernier échec avant tout.
 *
 * Une question jamais vue n'est pas maîtrisée — elle compte au dénominateur.
 * Sinon, un commercial qui n'a rien fait afficherait 100 %.
 */

export type Maitrise = {
  /** Questions dont la dernière tentative est juste. */
  maitrisees: number;
  total: number;
  /** Entier de 0 à 100, arrondi. */
  pourcentage: number;
};

export function maitrise(etats: EtatQuestion[]): Maitrise {
  const maitrisees = etats.filter((etat) => etat.dejaVue && !etat.derniereRatee).length;
  const total = etats.length;

  return {
    maitrisees,
    total,
    pourcentage: total === 0 ? 0 : Math.round((maitrisees / total) * 100),
  };
}

export type AvancementFormation = {
  formation: Formation;
  maitrise: Maitrise;
};

/**
 * Avancement par formation, dans l'ordre du catalogue.
 *
 * Les formations sans question publiée sont écartées : afficher « 0 % » sur
 * une formation qu'aucune question ne couvre reprocherait au commercial un
 * trou qui n'est pas le sien.
 */
export function avancementParFormation(
  formations: Formation[],
  questions: Question[],
  etats: EtatQuestion[],
): AvancementFormation[] {
  const parQuestion = new Map(etats.map((etat) => [etat.id, etat]));

  return formations
    .map((formation) => {
      const concernees = questions
        .filter((question) => question.formationIds.includes(formation.id))
        .map((question) => parQuestion.get(question.id))
        .filter((etat): etat is EtatQuestion => etat !== undefined);

      return { formation, maitrise: maitrise(concernees) };
    })
    .filter((avancement) => avancement.maitrise.total > 0)
    .sort((a, b) => a.maitrise.pourcentage - b.maitrise.pourcentage);
}
