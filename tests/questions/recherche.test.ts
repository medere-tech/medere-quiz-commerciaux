import { describe, expect, it } from 'vitest';

import { sansAccentNiCasse } from '@/lib/texte';

/**
 * Ce que ces tests protègent : la tolérance de la recherche.
 *
 * Exiger l'accent exact, c'est renvoyer « aucun résultat » à quelqu'un qui a
 * tapé le bon mot. C'est le moment où l'on conclut que l'outil ne marche pas,
 * et où l'on cesse de l'ouvrir.
 */

describe('sansAccentNiCasse', () => {
  it('retire les accents', () => {
    expect(sansAccentNiCasse('Ménopause')).toBe('menopause');
    expect(sansAccentNiCasse('Prééclampsie')).toBe('preeclampsie');
    expect(sansAccentNiCasse('Chirurgien-dentiste')).toBe('chirurgien-dentiste');
  });

  it('ramène tout en minuscules et sans espaces aux extrémités', () => {
    expect(sansAccentNiCasse('  DPC  ')).toBe('dpc');
  });

  it('rapproche l’apostrophe du clavier de celle du texte', () => {
    // Le texte porte une apostrophe typographique, le clavier en produit une
    // droite : sans ce rapprochement, « l'endométriose » ne trouve rien.
    expect(sansAccentNiCasse('l’endométriose')).toBe(sansAccentNiCasse("l'endometriose"));
  });

  it('laisse un terme déjà simple inchangé', () => {
    expect(sansAccentNiCasse('formats')).toBe('formats');
  });

  it('permet de retrouver une formation par un fragment de son nom', () => {
    const nom = 'Accompagnement de la femme à la ménopause, Programme intégré (E-learning)';

    // Le cas qui a motivé la correction : le mot que Noémie a en tête.
    expect(sansAccentNiCasse(nom).includes(sansAccentNiCasse('ménopause'))).toBe(true);
    expect(sansAccentNiCasse(nom).includes(sansAccentNiCasse('MENOPAUSE'))).toBe(true);
    expect(sansAccentNiCasse(nom).includes(sansAccentNiCasse('menopause'))).toBe(true);
  });
});
