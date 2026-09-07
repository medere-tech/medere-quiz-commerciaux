import { describe, expect, it } from 'vitest';

import { lireCollage, lireFeuille } from '@/lib/import/collage';
import {
  analyserTexte,
  celluleEnTexte,
  decoder,
  examiner,
  TAILLE_MAXIMALE,
} from '@/lib/import/fichier';

/**
 * Ce que ces tests protègent : l'encodage et la conversion des cellules, les
 * deux endroits où un fichier peut arriver « lu » et pourtant faux. Un CSV
 * Windows-1252 décodé en UTF-8 ne lève rien : il produit des losanges à la
 * place des accents, et les questions entrent en base ainsi. Une cellule
 * booléenne d'Excel rendue en « true » casse silencieusement la
 * correspondance avec les options d'un vrai ou faux.
 */

const utf8 = (texte: string) => new TextEncoder().encode(texte);

/** Le même texte tel que l'écrirait un Excel français sans UTF-8. */
function windows1252(texte: string): Uint8Array {
  return Uint8Array.from([...texte].map((lettre) => lettre.charCodeAt(0)));
}

const ENTETE = 'format;enonce;reponses;bonnesReponses;explication;formations;theme';

describe('decoder', () => {
  it('lit l’UTF-8 tel quel', () => {
    const { texte, encodage } = decoder(utf8('énoncé\tthème'));

    expect(texte).toBe('énoncé\tthème');
    expect(encodage).toBe('utf-8');
  });

  it('retombe sur Windows-1252 plutôt que de rendre des losanges', () => {
    const { texte, encodage } = decoder(windows1252('énoncé'));

    expect(texte).toBe('énoncé');
    expect(encodage).toBe('windows-1252');
    expect(texte).not.toContain('�');
  });
});

describe('examiner', () => {
  it('reconnaît les fichiers texte à leur extension', () => {
    for (const nom of ['lot.csv', 'lot.tsv', 'lot.tab', 'lot.txt']) {
      expect(examiner(nom, utf8('a\tb')).sorte).toBe('texte');
    }
  });

  it('reconnaît un classeur .xlsx', () => {
    expect(examiner('lot.xlsx', utf8('peu importe')).sorte).toBe('classeur');
  });

  it('reconnaît un classeur renommé en .csv à sa signature', () => {
    // Un .xlsx est une archive ZIP : « PK » en tête. Sans ce contrôle, on
    // afficherait une page de caractères illisibles sans expliquer pourquoi.
    const archive = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);

    expect(examiner('deguise.csv', archive).sorte).toBe('classeur');
  });

  it('renvoie le vieux .xls vers un enregistrement en .xlsx', () => {
    const verdict = examiner('ancien.xls', utf8('binaire'));

    expect(verdict.sorte).toBe('refuse');
    if (verdict.sorte !== 'refuse') return;
    expect(verdict.message).toContain('.xlsx');
  });

  it('refuse une extension inconnue en nommant celles qu’il accepte', () => {
    const verdict = examiner('notes.pdf', utf8('texte'));

    expect(verdict.sorte).toBe('refuse');
    if (verdict.sorte !== 'refuse') return;
    expect(verdict.message).toContain('.csv');
    expect(verdict.message).toContain('.xlsx');
  });

  it('refuse un fichier vide et un fichier trop lourd', () => {
    expect(examiner('vide.csv', new Uint8Array()).sorte).toBe('refuse');
    expect(examiner('gros.csv', new Uint8Array(TAILLE_MAXIMALE + 1)).sorte).toBe('refuse');
  });
});

describe('analyserTexte', () => {
  it('rend un en-tête lisible malgré le marqueur d’ordre des octets d’Excel', () => {
    const resultat = analyserTexte('excel.csv', utf8(`﻿${ENTETE}\nvf;Q ?;Oui|Non;1;Parce que;recAAA;publics`));

    expect(resultat.etat).toBe('texte');
    if (resultat.etat !== 'texte') return;
    expect(resultat.texte.startsWith('format')).toBe(true);

    // La preuve qui compte : la première colonne est reconnue. Avec le
    // marqueur collé devant, « format » ne ressemblerait à aucune colonne
    // connue et l'en-tête entier serait déclaré illisible.
    expect(lireCollage(resultat.texte).etat).toBe('lu');
  });

  it('refuse un fichier qui ne contient que des blancs', () => {
    expect(analyserTexte('blanc.csv', utf8('   \n\n  ')).etat).toBe('refuse');
  });
});

describe('celluleEnTexte', () => {
  it('rend une cellule vide, jamais null', () => {
    expect(celluleEnTexte(null)).toBe('');
    expect(celluleEnTexte(undefined)).toBe('');
  });

  it('rend les booléens d’Excel en Vrai et Faux, pas en true et false', () => {
    // Noémie tape VRAI dans la colonne « bonne réponse » : Excel en fait un
    // booléen. Rendu « true », il ne correspondrait à aucune option.
    expect(celluleEnTexte(true)).toBe('Vrai');
    expect(celluleEnTexte(false)).toBe('Faux');
  });

  it('rend un nombre sans notation scientifique parasite', () => {
    expect(celluleEnTexte(2)).toBe('2');
    expect(celluleEnTexte(92622525478)).toBe('92622525478');
  });

  it('rend une date en année-mois-jour', () => {
    expect(celluleEnTexte(new Date('2026-09-07T10:00:00Z'))).toBe('2026-09-07');
  });
});

describe('lireFeuille', () => {
  const entete = ENTETE.split(';');

  it('lit une feuille comme un collage, en-tête compris', () => {
    const resultat = lireFeuille('Feuil1', [
      entete,
      ['vf', 'Une question ?', 'Oui|Non', '1', 'Parce que', 'recAAA', 'publics'],
    ]);

    expect(resultat.etat).toBe('lu');
    if (resultat.etat !== 'lu') return;
    expect(resultat.provenance).toEqual({ forme: 'classeur', feuille: 'Feuil1' });
    expect(resultat.lignes[0]?.valeurs.enonce).toBe('Une question ?');
  });

  it('numérote d’après la ligne de la feuille, comme Excel l’affiche', () => {
    const resultat = lireFeuille('Feuil1', [
      entete,
      ['vf', 'Q1', 'Oui|Non', '1', 'Parce que', 'recAAA', 'publics'],
      ['', '', '', '', '', '', ''],
      ['vf', 'Q2', 'Oui|Non', '1', 'Parce que', 'recAAA', 'publics'],
    ]);

    expect(resultat.etat).toBe('lu');
    if (resultat.etat !== 'lu') return;
    // La ligne 3 est vide : la question suivante est la ligne 4 du tableur.
    expect(resultat.lignes.map((ligne) => ligne.numero)).toEqual([2, 4]);
  });

  it('refuse en bloc une feuille dont l’en-tête ne dit rien', () => {
    const resultat = lireFeuille('Feuil1', [['a', 'b'], ['1', '2']]);

    expect(resultat.etat).toBe('entete-illisible');
  });

  it('rend « vide » sur une feuille sans aucune ligne', () => {
    expect(lireFeuille('Feuil1', []).etat).toBe('vide');
    expect(lireFeuille('Feuil1', [['', '']]).etat).toBe('vide');
  });
});
