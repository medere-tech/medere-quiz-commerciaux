/**
 * Forme d'un agrégat de statistiques, et sa lecture défensive.
 *
 * Séparé du dépôt parce qu'il ne dépend de rien : `questionStats` est écrit
 * par la Cloud Function, hors de cette application, et peut donc arriver dans
 * un état que notre code n'a pas produit. La lecture se teste sans navigateur
 * ni Firebase.
 *
 * **Aucun identifiant d'utilisateur n'y figure**, et il n'y en a jamais eu :
 * ce n'est pas un champ qu'on masque, c'est un champ qui n'existe pas.
 */

export type StatsQuestion = {
  questionId: string;
  tentatives: number;
  echecs: number;
  majLe: Date | null;
};

function entierPositif(valeur: unknown): number {
  return typeof valeur === 'number' && Number.isFinite(valeur) && valeur > 0
    ? Math.floor(valeur)
    : 0;
}

type Horodatage = { toDate?: () => Date };

export function enStats(identifiant: string, donnees: Record<string, unknown>): StatsQuestion {
  const tentatives = entierPositif(donnees.tentatives);

  return {
    questionId: identifiant,
    tentatives,
    // Un agrégat ne peut pas compter plus d'échecs que de tentatives. Si cela
    // arrive, c'est une anomalie d'écriture : on la borne plutôt que
    // d'afficher un taux supérieur à cent pour cent.
    echecs: Math.min(entierPositif(donnees.echecs), tentatives),
    majLe: (donnees.majLe as Horodatage | undefined)?.toDate?.() ?? null,
  };
}
