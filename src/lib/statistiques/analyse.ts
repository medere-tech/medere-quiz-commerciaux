import type { Formation } from '@/lib/formations/depot';
import type { Question } from '@/lib/questions/depot';
import type { StatsQuestion } from '@/lib/statistiques/modele';

/**
 * Ce que l'écran de statistiques calcule, et ce qu'il refuse de calculer.
 *
 * **Le sens de l'écran.** Une question massivement ratée signale le plus
 * souvent un argumentaire à clarifier, pas des commerciaux à former. Le
 * classement sert donc à repérer ce qui est mal expliqué, pas qui explique
 * mal — et c'est aussi pour cela qu'aucun nom n'y figure.
 *
 * **Le piège du petit échantillon.** Une question tentée une fois et ratée
 * affiche cent pour cent d'échec. Classée en tête, elle enverrait Noémie
 * réécrire une fiche sur la foi d'une seule erreur, peut-être une faute de
 * frappe d'un commercial pressé. Les questions sous le seuil sont donc
 * écartées du classement et présentées à part, sans taux : « pas encore assez
 * de réponses » est une information, un taux inventé n'en est pas une.
 */

/**
 * Nombre de tentatives en dessous duquel un taux d'échec ne veut rien dire.
 * Trois, pour une équipe d'une dizaine de commerciaux : c'est assez pour
 * qu'un échec isolé ne domine plus, assez peu pour qu'une question entre
 * rapidement dans le classement.
 */
export const TENTATIVES_FIABLES = 3;

export type LigneStat = {
  question: Question;
  formation: Formation | null;
  tentatives: number;
  echecs: number;
  /** Entier de 0 à 100. Ne vaut rien sous `TENTATIVES_FIABLES`. */
  tauxEchec: number;
};

export function tauxEchec(echecs: number, tentatives: number): number {
  if (tentatives <= 0) return 0;
  return Math.round((echecs / tentatives) * 100);
}

export type Classement = {
  /** Assez de réponses pour conclure, les plus ratées d'abord. */
  fiables: LigneStat[];
  /** Au moins une réponse, mais trop peu pour publier un taux. */
  tropPeu: LigneStat[];
  /** Publiées et jamais servies : personne ne les a encore vues. */
  jamaisTentees: Question[];
};

export function classer(
  questions: Question[],
  stats: StatsQuestion[],
  formations: Formation[],
  seuil: number = TENTATIVES_FIABLES,
): Classement {
  const parId = new Map(stats.map((stat) => [stat.questionId, stat]));
  const parFormation = new Map(formations.map((formation) => [formation.id, formation]));

  const fiables: LigneStat[] = [];
  const tropPeu: LigneStat[] = [];
  const jamaisTentees: Question[] = [];

  for (const question of questions) {
    const stat = parId.get(question.id);

    if (!stat || stat.tentatives === 0) {
      jamaisTentees.push(question);
      continue;
    }

    const ligne: LigneStat = {
      question,
      formation: parFormation.get(question.formationIds[0] ?? '') ?? null,
      tentatives: stat.tentatives,
      echecs: stat.echecs,
      tauxEchec: tauxEchec(stat.echecs, stat.tentatives),
    };

    if (stat.tentatives >= seuil) fiables.push(ligne);
    else tropPeu.push(ligne);
  }

  // À taux égal, la question la plus servie passe devant : elle est mieux
  // établie, donc plus urgente à reprendre.
  fiables.sort((a, b) => b.tauxEchec - a.tauxEchec || b.tentatives - a.tentatives);
  tropPeu.sort((a, b) => b.echecs - a.echecs || b.tentatives - a.tentatives);

  return { fiables, tropPeu, jamaisTentees };
}

export type FragiliteFormation = {
  formation: Formation;
  tentatives: number;
  echecs: number;
  tauxEchec: number;
  questions: number;
};

/**
 * Agrégat par formation. On additionne les tentatives et les échecs plutôt
 * que de moyenner des taux : une question servie trente fois pèse plus qu'une
 * question servie trois fois, et c'est ce qu'on veut.
 */
export function parFormation(
  questions: Question[],
  stats: StatsQuestion[],
  formations: Formation[],
): FragiliteFormation[] {
  const parId = new Map(stats.map((stat) => [stat.questionId, stat]));
  const cumuls = new Map<string, { tentatives: number; echecs: number; questions: number }>();

  for (const question of questions) {
    const stat = parId.get(question.id);
    if (!stat || stat.tentatives === 0) continue;

    // Une question peut être rattachée à plusieurs formations : elle compte
    // pour chacune. Le total par formation n'est donc pas une partition du
    // total général, et l'écran ne le présente jamais comme tel.
    for (const formationId of question.formationIds) {
      const cumul = cumuls.get(formationId) ?? { tentatives: 0, echecs: 0, questions: 0 };
      cumul.tentatives += stat.tentatives;
      cumul.echecs += stat.echecs;
      cumul.questions += 1;
      cumuls.set(formationId, cumul);
    }
  }

  return formations
    .flatMap((formation) => {
      const cumul = cumuls.get(formation.id);
      if (!cumul) return [];

      return [
        {
          formation,
          tentatives: cumul.tentatives,
          echecs: cumul.echecs,
          questions: cumul.questions,
          tauxEchec: tauxEchec(cumul.echecs, cumul.tentatives),
        },
      ];
    })
    .sort((a, b) => b.tauxEchec - a.tauxEchec || b.tentatives - a.tentatives);
}

export type Resume = {
  reponses: number;
  tauxEchecMoyen: number;
  questionsPubliees: number;
  jamaisTentees: number;
};

/**
 * Les quatre chiffres d'en-tête.
 *
 * **Ce qui n'y figure pas, et pourquoi.** La maquette annonce une « maîtrise
 * moyenne » et un nombre de « séries jouées ». Les deux se calculent par
 * commercial, à partir de `users/{uid}` et de ses réponses — que les règles
 * ferment à l'administrateur, sans exception. Ils sont donc remplacés par
 * deux chiffres que `questionStats` porte réellement.
 */
export function resumer(questions: Question[], stats: StatsQuestion[]): Resume {
  const publiees = new Set(questions.map((question) => question.id));

  let reponses = 0;
  let echecs = 0;
  let tentees = 0;

  for (const stat of stats) {
    if (!publiees.has(stat.questionId)) continue;
    reponses += stat.tentatives;
    echecs += stat.echecs;
    if (stat.tentatives > 0) tentees += 1;
  }

  return {
    reponses,
    tauxEchecMoyen: tauxEchec(echecs, reponses),
    questionsPubliees: publiees.size,
    jamaisTentees: publiees.size - tentees,
  };
}
