import { describe, expect, it } from 'vitest';

import { decouperTableau, devinerSeparateur } from '@/lib/import/tableau';

/**
 * Le découpage est la couche où un import se casse en silence : une cellule
 * mal fendue ne lève rien, elle range l'explication dans le thème. Les cas
 * couverts ici sont ceux que produisent réellement un tableur et une réponse
 * d'IA — pas des curiosités théoriques.
 */

describe('devinerSeparateur', () => {
  it('choisit la tabulation dès qu’elle apparaît', () => {
    expect(devinerSeparateur('a\tb\tc')).toBe('tabulation');
  });

  it('préfère la tabulation même quand la ligne contient des virgules', () => {
    // Un énoncé français est plein de virgules ; aucun n'est tabulé.
    expect(devinerSeparateur('format\tenonce\nvf\tOui, non, peut-être')).toBe('tabulation');
  });

  it('reconnaît le point-virgule des exports Excel français', () => {
    expect(devinerSeparateur('format;enonce;theme')).toBe('point-virgule');
  });

  it('ne compte pas les séparateurs enfermés dans des guillemets', () => {
    expect(devinerSeparateur('"un, deux, trois";b;c')).toBe('point-virgule');
  });

  it('ignore les lignes vides du début', () => {
    expect(devinerSeparateur('\n\n\na\tb')).toBe('tabulation');
  });
});

describe('decouperTableau', () => {
  it('sépare en-tête et lignes, et numérote comme le tableur', () => {
    const tableau = decouperTableau('format\tenonce\nvf\tUne question');

    expect(tableau?.entetes).toEqual(['format', 'enonce']);
    // L'en-tête occupe la ligne 1 : la première question est la ligne 2.
    expect(tableau?.lignes[0]?.numero).toBe(2);
    expect(tableau?.lignes[0]?.cellules).toEqual(['vf', 'Une question']);
  });

  it('garde un retour à la ligne enfermé dans une cellule', () => {
    const colle = 'format\tenonce\nvf\t"Deux\nlignes"';
    const tableau = decouperTableau(colle);

    expect(tableau?.lignes).toHaveLength(1);
    expect(tableau?.lignes[0]?.cellules[1]).toBe('Deux\nlignes');
  });

  it('garde un séparateur enfermé dans une cellule', () => {
    const tableau = decouperTableau('a,b\n"un, deux",trois');

    expect(tableau?.lignes[0]?.cellules).toEqual(['un, deux', 'trois']);
  });

  it('rend leur guillemet aux cellules qui en contiennent', () => {
    const tableau = decouperTableau('a\n"Il a dit ""oui"""');

    expect(tableau?.lignes[0]?.cellules[0]).toBe('Il a dit "oui"');
  });

  it('accepte les fins de ligne Windows', () => {
    const tableau = decouperTableau('a\tb\r\n1\t2\r\n3\t4');

    expect(tableau?.lignes.map((ligne) => ligne.cellules)).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('avale le marqueur d’ordre des octets des CSV Excel', () => {
    const tableau = decouperTableau('﻿format,enonce\nvf,Une question');

    expect(tableau?.entetes[0]).toBe('format');
  });

  it('laisse tomber les lignes entièrement vides', () => {
    const tableau = decouperTableau('a\tb\n\n1\t2\n\t\n3\t4\n');

    expect(tableau?.lignes).toHaveLength(2);
  });

  it('numérote d’après la position réelle dans le tableur', () => {
    const tableau = decouperTableau('a\tb\n1\t2\n3\t4');

    expect(tableau?.lignes.map((ligne) => ligne.numero)).toEqual([2, 3]);
  });

  it('ne renumérote pas après une ligne vide au milieu', () => {
    // La ligne 3 est vide : la question suivante est la ligne 4 dans le
    // tableur, et c'est ce numéro qu'il faut annoncer pour qu'on la retrouve.
    const tableau = decouperTableau('a\tb\n1\t2\n\n3\t4');

    expect(tableau?.lignes.map((ligne) => ligne.numero)).toEqual([2, 4]);
  });

  it('ne compte pas les lignes vides qui précèdent l’en-tête', () => {
    const tableau = decouperTableau('\n\nformat\tenonce\nvf\tUne question');

    expect(tableau?.entetes).toEqual(['format', 'enonce']);
    expect(tableau?.lignes[0]?.numero).toBe(4);
  });

  it('rend null sur un collage sans aucune ligne', () => {
    expect(decouperTableau('   \n  \n')).toBeNull();
  });

  it('ne perd pas la dernière ligne faute de saut final', () => {
    const tableau = decouperTableau('a\tb\n1\t2');

    expect(tableau?.lignes).toHaveLength(1);
  });
});
