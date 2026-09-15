/**
 * Répartition des votes d'une question de séance.
 *
 * **Le défaut que ce module corrige.** La part de chaque option était calculée
 * sur la **somme des comptes**, et le nombre de répondants annoncé de la même
 * façon. C'est juste tant qu'une question n'admet qu'une réponse — chacun coche
 * une case, la somme vaut le nombre de personnes. Sur un QCM à deux bonnes
 * réponses, un seul participant qui coche deux options produit `[1, 1, 0, 0]`,
 * dont la somme fait deux : l'écran annonçait « 2 réponses au total » pour une
 * seule personne, et donnait 50 % à chaque option cochée au lieu de 100 %.
 *
 * **Un chiffre faux se remarque immédiatement sur un mur.** Dix personnes le
 * lisent en même temps et l'une d'elles sait qu'elle est seule à avoir répondu.
 *
 * La bonne référence est le nombre de **répondants**, pas la somme des choix :
 * « combien de personnes ont coché cette option », question qui garde un sens
 * quel que soit le nombre de réponses attendues.
 */

/**
 * Part des répondants ayant coché une option, en pourcentage entier.
 *
 * Rend zéro quand personne n'a répondu : diviser par zéro donnerait `NaN`, qui
 * s'afficherait tel quel.
 */
export function partDesRepondants(compte: number, repondants: number): number {
  if (repondants <= 0) return 0;
  return Math.round((compte / repondants) * 100);
}
