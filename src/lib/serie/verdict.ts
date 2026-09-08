import type { Question } from '@/lib/questions/depot';

/**
 * Verdict d'une réponse, et ce que l'écran de correction doit montrer.
 *
 * **La règle qui compte.** Pour un QCM, l'ensemble sélectionné doit
 * correspondre **exactement** à l'ensemble attendu. Une réponse partielle est
 * fausse — et l'interface doit montrer ce qui avait été trouvé et ce qui
 * manquait, sans quoi « faux » n'apprend rien. Les règles Firestore
 * recalculent ce même verdict de leur côté : le client ne décide pas seul de
 * sa réussite.
 */

export const ETOILES_PAR_SEUIL = [
  { seuil: 0.9, etoiles: 3 },
  { seuil: 0.7, etoiles: 2 },
  { seuil: 0.5, etoiles: 1 },
] as const;

/**
 * Les seuils, écrits pour l'écran. Le libellé se déduit de `ETOILES_PAR_SEUIL`
 * : changer un seuil change la phrase, on ne peut pas annoncer 90 % et en
 * appliquer 80. Un commercial gagnait des étoiles sans savoir comment.
 */
export function libelleSeuilsEtoiles(): string {
  const paliers = ETOILES_PAR_SEUIL.map((palier, rang) => {
    const pourcentage = `${Math.round(palier.seuil * 100)} %`;
    return rang === 0
      ? `${palier.etoiles} étoile${palier.etoiles > 1 ? 's' : ''} dès ${pourcentage}`
      : `${palier.etoiles} dès ${pourcentage}`;
  });

  return `${paliers.join(', ')} de bonnes réponses.`;
}

/** État d'une option une fois la réponse validée. */
export type EtatOption =
  /** Cochée, et attendue. */
  | 'juste'
  /** Attendue, mais pas cochée : c'est ce qui manquait. */
  | 'manquee'
  /** Cochée à tort. */
  | 'fausse'
  /** Ni cochée ni attendue. */
  | 'inerte';

export function memesEnsembles(gauche: string[], droite: string[]): boolean {
  const a = new Set(gauche);
  const b = new Set(droite);
  if (a.size !== b.size) return false;
  for (const element of a) if (!b.has(element)) return false;
  return true;
}

export function etatOption(
  identifiant: string,
  choisies: string[],
  attendues: string[],
): EtatOption {
  const cochee = choisies.includes(identifiant);
  const attendue = attendues.includes(identifiant);

  if (cochee && attendue) return 'juste';
  if (!cochee && attendue) return 'manquee';
  if (cochee && !attendue) return 'fausse';
  return 'inerte';
}

export type Correction = {
  correcte: boolean;
  /** Vrai quand une partie seulement des bonnes réponses a été trouvée. */
  partielle: boolean;
  etats: Record<string, EtatOption>;
  titre: string;
};

export function corriger(question: Question, choisies: string[]): Correction {
  const attendues = question.bonnesReponses;
  const correcte = memesEnsembles(choisies, attendues);

  const etats = Object.fromEntries(
    question.ordreOptions.map((identifiant) => [
      identifiant,
      etatOption(identifiant, choisies, attendues),
    ]),
  );

  const trouvees = choisies.filter((identifiant) => attendues.includes(identifiant)).length;
  const manquantes = attendues.length - trouvees;
  const enTrop = choisies.length - trouvees;
  const partielle = !correcte && trouvees > 0;

  return {
    correcte,
    partielle,
    etats,
    titre: titrer(correcte, manquantes, enTrop, attendues.length),
  };
}

/**
 * Le titre du verdict nomme l'écart, il ne se contente pas de « faux ».
 * Savoir qu'il manquait une réponse, ou qu'on en a coché une de trop, est
 * précisément ce qui distingue une correction d'une sanction.
 *
 * **Sauf quand une seule réponse est attendue.** Sur un vrai ou faux, se
 * tromper produit mécaniquement « une manquante et une en trop » — ce qui est
 * exact et absurde à lire. Il n'y avait qu'un choix : on le dit simplement.
 */
function titrer(
  correcte: boolean,
  manquantes: number,
  enTrop: number,
  attendues: number,
): string {
  if (correcte) return 'Bonne réponse';

  if (attendues <= 1) return 'Ce n’était pas la bonne réponse';

  if (manquantes > 0 && enTrop > 0) {
    return 'Il manquait une réponse, et une autre était en trop';
  }
  if (manquantes > 0) {
    return manquantes > 1 ? `Il manquait ${manquantes} réponses` : 'Il manquait une réponse';
  }
  if (enTrop > 1) return `${enTrop} réponses étaient en trop`;
  return 'Réponse incorrecte';
}

/**
 * Étoiles d'une série complète. Une série abandonnée n'en rapporte aucune —
 * c'est l'appelant qui ne les crédite pas, la fonction ne connaît que le
 * score.
 */
export function etoilesGagnees(justes: number, total: number): number {
  if (total <= 0) return 0;
  const taux = justes / total;
  return ETOILES_PAR_SEUIL.find((palier) => taux >= palier.seuil)?.etoiles ?? 0;
}
