import { describe, expect, it } from 'vitest';

import { normaliserEnonce } from '@/lib/texte';

/**
 * Ce que ces tests protègent : le contrat entre le champ stocké
 * `enonceNormalise` et la requête qui l'interroge.
 *
 * Les deux appellent la même fonction. Si elle change, les valeurs déjà en
 * base cessent de correspondre aux valeurs recherchées, et la détection de
 * doublons devient silencieusement aveugle — sans erreur, sans trace.
 * Changer cette fonction impose donc de rejouer
 * `npm run enonces:normaliser -- --faire`.
 */

describe('normaliserEnonce', () => {
  it('ignore la casse', () => {
    expect(normaliserEnonce('Le DPC est obligatoire')).toBe(
      normaliserEnonce('le dpc est obligatoire'),
    );
  });

  it('ignore les accents', () => {
    expect(normaliserEnonce('Améliorer le diagnostic précoce')).toBe(
      'ameliorer le diagnostic precoce',
    );
  });

  it('ignore la ponctuation et les espaces multiples', () => {
    expect(normaliserEnonce('Le DPC est-il obligatoire ?')).toBe(
      normaliserEnonce('le  dpc   est il obligatoire'),
    );
  });

  it('ignore les apostrophes typographiques comme les droites', () => {
    expect(normaliserEnonce('Durée d’une action')).toBe(normaliserEnonce("Duree d'une action"));
  });

  it('ne confond pas deux énoncés différents', () => {
    expect(normaliserEnonce('Quels publics ?')).not.toBe(normaliserEnonce('Quels documents ?'));
  });

  it('rend une chaîne vide pour un énoncé sans caractère utile', () => {
    expect(normaliserEnonce('   ')).toBe('');
    expect(normaliserEnonce('??? !!!')).toBe('');
  });

  it('reste stable si on la réapplique', () => {
    // La forme normalisée est elle-même normalisée : sans cela, comparer une
    // valeur relue en base à une valeur fraîchement calculée échouerait.
    const forme = normaliserEnonce('Le DPC est-il obligatoire ?');
    expect(normaliserEnonce(forme)).toBe(forme);
  });
});
