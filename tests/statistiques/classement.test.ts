import { describe, expect, it } from 'vitest';

import { classer, ecartAuPodium, type ReponseSeance } from '../../functions/src/classement';

/**
 * Ce que ces tests protègent : un classement qu'on projette devant une salle
 * ne peut pas être approximatif.
 *
 * Dix personnes le lisent en même temps, et l'une d'elles sait qu'elle a
 * répondu juste sept fois. Une erreur d'arbitrage se voit dans la seconde et
 * discrédite l'exercice entier.
 */
const NOMS = new Map([
  ['u-yanis', 'Yanis'],
  ['u-lea', 'Léa'],
  ['u-camille', 'Camille'],
  ['u-marc', 'Marc'],
]);

function reponses(...lignes: [string, boolean, number][]): ReponseSeance[] {
  return lignes.map(([uid, correcte, repondueLe]) => ({ uid, correcte, repondueLe }));
}

describe('classer', () => {
  it('classe aux points, du meilleur au moins bon', () => {
    const rangs = classer(
      reponses(
        ['u-yanis', true, 10],
        ['u-yanis', true, 20],
        ['u-lea', true, 10],
        ['u-lea', false, 20],
      ),
      NOMS,
    );

    expect(rangs.map((r) => r.uid)).toEqual(['u-yanis', 'u-lea']);
    expect(rangs[0]).toMatchObject({ nom: 'Yanis', justes: 2, rang: 1, distinction: 'diamant' });
  });

  it('départage à la vitesse quand les points sont égaux', () => {
    const rangs = classer(
      reponses(
        ['u-lea', true, 100],
        ['u-camille', true, 40],
        ['u-yanis', true, 70],
      ),
      NOMS,
    );

    // Même score : c'est l'ordre d'arrivée des réponses qui tranche.
    expect(rangs.map((r) => r.uid)).toEqual(['u-camille', 'u-yanis', 'u-lea']);
    expect(rangs.map((r) => r.distinction)).toEqual(['diamant', 'or', 'argent']);
  });

  it('donne un rang à tout le monde, une distinction à trois au plus', () => {
    const rangs = classer(
      reponses(
        ['u-yanis', true, 10],
        ['u-lea', true, 20],
        ['u-camille', true, 30],
        ['u-marc', true, 40],
      ),
      NOMS,
    );

    expect(rangs.map((r) => r.rang)).toEqual([1, 2, 3, 4]);
    expect(rangs[3]).toMatchObject({ rang: 4, distinction: null });
  });

  it('n’invente pas de participant : qui n’a pas répondu n’est pas classé', () => {
    const rangs = classer(reponses(['u-yanis', true, 10]), NOMS);
    expect(rangs).toHaveLength(1);
  });

  it('nomme un participant dont le marqueur manque sans casser le classement', () => {
    const rangs = classer(reponses(['u-inconnu', true, 10]), NOMS);
    expect(rangs[0]?.nom).toBe('Participant');
  });

  it('rend le même classement quel que soit l’ordre d’arrivée des réponses', () => {
    const lignes: [string, boolean, number][] = [
      ['u-yanis', true, 10],
      ['u-lea', true, 10],
    ];
    const premier = classer(reponses(...lignes), NOMS);
    const second = classer(reponses(...[...lignes].reverse()), NOMS);
    expect(premier.map((r) => r.uid)).toEqual(second.map((r) => r.uid));
  });
});

describe('ecartAuPodium', () => {
  it('dit ce qui manquait, en bonnes réponses', () => {
    const rangs = classer(
      reponses(
        ['u-yanis', true, 10],
        ['u-yanis', true, 11],
        ['u-lea', true, 10],
        ['u-lea', true, 11],
        ['u-camille', true, 10],
        ['u-camille', true, 11],
        ['u-marc', true, 10],
      ),
      NOMS,
    );

    expect(ecartAuPodium(rangs, 'u-marc')).toBe(1);
  });

  it('ne dit rien à qui est sur le podium', () => {
    const rangs = classer(reponses(['u-yanis', true, 10]), NOMS);
    expect(ecartAuPodium(rangs, 'u-yanis')).toBeNull();
  });

  it('se tait quand l’écart est nul : c’est la vitesse qui a tranché', () => {
    const rangs = classer(
      reponses(
        ['u-yanis', true, 10],
        ['u-lea', true, 20],
        ['u-camille', true, 30],
        ['u-marc', true, 40],
      ),
      NOMS,
    );

    expect(ecartAuPodium(rangs, 'u-marc')).toBeNull();
  });
});

/**
 * Ce que ce test protège : le podium récompense un rang, pas une performance.
 *
 * Dans une finale de cent mètres, le premier prend l'or même s'il court en
 * seize secondes. Une condition de score minimum a existé un moment dans ce
 * fichier ; elle a été retirée, et ce test est là pour qu'elle ne revienne pas
 * sous couvert de bon sens.
 */
describe('podium sans condition de score', () => {
  it('distingue le premier même avec un score faible', () => {
    const rangs = classer(
      reponses(
        ['u-yanis', false, 10],
        ['u-yanis', true, 20],
        ['u-lea', false, 10],
        ['u-lea', false, 20],
      ),
      NOMS,
    );

    expect(rangs[0]).toMatchObject({ justes: 1, rang: 1, distinction: 'diamant' });
    expect(rangs[1]).toMatchObject({ justes: 0, rang: 2, distinction: 'or' });
  });

  it('distingue même un participant qui n’a rien trouvé', () => {
    const rangs = classer(reponses(['u-yanis', false, 10]), NOMS);
    expect(rangs[0]).toMatchObject({ justes: 0, rang: 1, distinction: 'diamant' });
  });

  it('n’attribue que ce qu’il y a de participants', () => {
    const deux = classer(reponses(['u-yanis', true, 10], ['u-lea', true, 20]), NOMS);
    expect(deux.map((r) => r.distinction)).toEqual(['diamant', 'or']);

    const un = classer(reponses(['u-yanis', true, 10]), NOMS);
    expect(un.map((r) => r.distinction)).toEqual(['diamant']);
  });
});
