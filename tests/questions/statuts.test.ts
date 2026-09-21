import { describe, expect, it } from 'vitest';

import {
  estServie,
  LIBELLES_STATUT,
  STATUTS_QUESTION,
  STATUTS_SERVIS,
  TONS_STATUT,
} from '@/lib/questions/modele';

/**
 * Les trois statuts d'une question.
 *
 * **« À relire » est servi, et c'est toute la décision du lot.** Il se place à
 * côté de « publiée », pas entre le brouillon et elle : il dit « cette question
 * demande du travail », pas « elle ne sort plus ». Pour retirer une question, il
 * y a le brouillon — et un troisième statut qui ne sortirait pas serait un
 * second brouillon.
 *
 * Ces tests gardent surtout la conséquence la moins visible : **un statut
 * ajouté doit décider s'il sort ou non**, et ne peut pas arriver à l'écran sans
 * libellé ni teinte.
 */

describe('Les statuts', () => {
  it('en compte trois, du brouillon à la publication', () => {
    expect(STATUTS_QUESTION).toEqual(['brouillon', 'aRelire', 'publiee']);
  });

  it('nomme et teinte chacun', () => {
    for (const statut of STATUTS_QUESTION) {
      expect(LIBELLES_STATUT[statut]).toBeTruthy();
      expect(TONS_STATUT[statut]).toBeTruthy();
    }
  });

  /* « À relire » prend le jaune d'attention : ni le vert d'une question en
     service, ni le gris d'un brouillon. */
  it('distingue les trois teintes', () => {
    expect(new Set(Object.values(TONS_STATUT)).size).toBe(3);
  });
});

describe('Ce qui sort aux commerciaux', () => {
  it('sert les questions publiées', () => {
    expect(estServie('publiee')).toBe(true);
  });

  /*
   * **Le cas qui porte la décision.** Le signal qui met une question à relire
   * est un taux d'échec — donc des réponses. La retirer figerait la
   * statistique au moment du marquage, et l'on perdrait le seul moyen de
   * savoir si la réécriture a servi.
   */
  it('sert les questions à relire', () => {
    expect(estServie('aRelire')).toBe(true);
    expect(STATUTS_SERVIS).toContain('aRelire');
  });

  /* Le brouillon reste l'outil pour retirer une question, et le seul. */
  it('ne sert pas un brouillon', () => {
    expect(estServie('brouillon')).toBe(false);
  });

  it('ne sert que deux des trois statuts', () => {
    expect(STATUTS_QUESTION.filter(estServie)).toEqual(['aRelire', 'publiee']);
  });
});
