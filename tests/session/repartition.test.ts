import { describe, expect, it } from 'vitest';

import { partDesRepondants } from '@/lib/session/repartition';

/**
 * Ce que ces tests protègent : le chiffre projeté sur le mur.
 *
 * Le défaut d'origine ne se voyait que sur un QCM à plusieurs bonnes réponses.
 * Un seul participant, deux options cochées, et l'écran annonçait « 2 réponses
 * au total » en donnant 50 % à chaque option — devant une salle où une seule
 * personne avait répondu.
 */
describe('partDesRepondants', () => {
  it('rapporte au nombre de personnes, pas à la somme des choix', () => {
    // Un répondant qui coche deux options sur quatre : chacune vaut 100 %.
    expect(partDesRepondants(1, 1)).toBe(100);
  });

  it('donne les parts d’un vote ordinaire', () => {
    expect(partDesRepondants(3, 4)).toBe(75);
    expect(partDesRepondants(1, 4)).toBe(25);
    expect(partDesRepondants(0, 4)).toBe(0);
  });

  it('ne divise pas par zéro quand personne n’a répondu', () => {
    expect(partDesRepondants(0, 0)).toBe(0);
    expect(partDesRepondants(2, 0)).toBe(0);
  });

  it('reste borné quand plusieurs options sont cochées par tous', () => {
    // Dix personnes, toutes cochent les deux mêmes options : 100 % chacune.
    // La somme des parts vaut 200 %, et c'est correct — ce ne sont pas des
    // parts d'un tout, mais des parts de la salle.
    expect(partDesRepondants(10, 10)).toBe(100);
  });
});
