import { describe, expect, it } from 'vitest';

import { explicationAChange, nomDeSignature } from '@/lib/questions/modele';

/**
 * La signature d'une explication — qui l'a écrite, et quand elle a changé.
 *
 * **Le piège que ces tests gardent :** l'écran du commercial annonce « mise à
 * jour le… » juste à côté de l'explication. Si une correction de virgule
 * faisait avancer cette date, elle n'apprendrait plus rien — et personne ne
 * s'en apercevrait, parce qu'une date fausse ressemble exactement à une date
 * juste.
 */

const texte = {
  explication: 'Le seuil d’indemnisation est de six heures.',
  argumentaire: 'Annoncez-le avant la signature.',
};

describe('Ce qui fait bouger la date', () => {
  it('ne bouge pas quand rien ne change', () => {
    expect(explicationAChange(texte, { ...texte })).toBe(false);
  });

  it('bouge quand l’explication est réécrite', () => {
    expect(
      explicationAChange(texte, { ...texte, explication: 'Le seuil est de huit heures.' }),
    ).toBe(true);
  });

  /* L'argumentaire s'affiche à côté de l'explication et porte la même
     signature : le changer est une mise à jour. */
  it('bouge quand l’argumentaire est réécrit', () => {
    expect(
      explicationAChange(texte, { ...texte, argumentaire: 'Dites-le à la découverte.' }),
    ).toBe(true);
  });

  it('bouge quand un argumentaire apparaît', () => {
    expect(explicationAChange({ ...texte, argumentaire: '' }, texte)).toBe(true);
  });

  /*
   * **Le cas qui donne son sens au champ.** Une espace en fin de ligne, une
   * indentation reprise : le texte lu est le même, la date ne doit pas bouger.
   */
  it('ignore les espaces de bord et les espaces répétés', () => {
    expect(
      explicationAChange(texte, {
        explication: `  ${texte.explication}  `,
        argumentaire: texte.argumentaire.replace(' ', '   '),
      }),
    ).toBe(false);
  });

  /*
   * En revanche, une reformulation même minime en est une : il n'appartient
   * pas au code de juger de l'ampleur d'une réécriture.
   */
  it('ne juge pas de l’ampleur d’une réécriture', () => {
    expect(
      explicationAChange(texte, { ...texte, explication: texte.explication.replace('.', ' !') }),
    ).toBe(true);
  });
});

describe('Le nom de signature', () => {
  it('prend le nom d’affichage quand il existe', () => {
    expect(nomDeSignature({ displayName: 'Noémie Vasseur', email: 'noemie@medere.fr' })).toBe(
      'Noémie Vasseur',
    );
  });

  /* Mieux vaut « noemie » qu'une signature vide : une explication sans auteur
     n'a personne à qui la reprocher, ni à qui la demander. */
  it('retombe sur la partie locale de l’adresse', () => {
    expect(nomDeSignature({ displayName: null, email: 'noemie@medere.fr' })).toBe('noemie');
    expect(nomDeSignature({ displayName: '   ', email: 'noemie@medere.fr' })).toBe('noemie');
  });

  it('rend une chaîne vide quand il n’y a rien à signer', () => {
    expect(nomDeSignature({ displayName: null, email: null })).toBe('');
  });

  /* Il s'affiche en bout de ligne sous une explication, pas en titre. */
  it('borne le nom', () => {
    const long = 'a'.repeat(200);
    expect(nomDeSignature({ displayName: long, email: null }).length).toBe(60);
  });
});
