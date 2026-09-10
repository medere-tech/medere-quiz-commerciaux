import { describe, expect, it } from 'vitest';

import { doitCompter, type EtatSession } from '../../functions/src/session';

/**
 * Ce que ces tests protègent : le compteur affiché pendant la séance ne compte
 * que la question ouverte.
 *
 * Le compteur est remis à zéro quand l'animatrice passe à la question
 * suivante. Une réponse partie juste avant peut arriver juste après : comptée,
 * elle ferait démarrer la question suivante à « 1 réponse » sans que personne
 * comprenne d'où elle sort. C'est le genre de détail qui décrédibilise un
 * écran projeté devant dix personnes.
 */
const OUVERTE: EtatSession = {
  statut: 'encours',
  revelee: false,
  indexCourant: 1,
  questionIds: ['q-a', 'q-b', 'q-c'],
};

describe('doitCompter', () => {
  it('compte une réponse à la question ouverte', () => {
    expect(doitCompter(OUVERTE, 'q-b')).toBe(true);
  });

  it('ignore une réponse à la question précédente', () => {
    expect(doitCompter(OUVERTE, 'q-a')).toBe(false);
  });

  it('ignore une réponse à une question à venir', () => {
    expect(doitCompter(OUVERTE, 'q-c')).toBe(false);
  });

  it('ignore une réponse arrivée après la révélation', () => {
    expect(doitCompter({ ...OUVERTE, revelee: true }, 'q-b')).toBe(false);
  });

  it('ignore une réponse hors d’une session en cours', () => {
    expect(doitCompter({ ...OUVERTE, statut: 'terminee' }, 'q-b')).toBe(false);
    expect(doitCompter({ ...OUVERTE, statut: 'attente' }, 'q-b')).toBe(false);
  });

  it('ne se laisse pas abuser par un document de session déformé', () => {
    // Le SDK Admin écrit hors règles : rien ne garantit la forme ici.
    expect(doitCompter({}, 'q-b')).toBe(false);
    expect(doitCompter({ ...OUVERTE, questionIds: 'q-b' }, 'q-b')).toBe(false);
    expect(doitCompter({ ...OUVERTE, indexCourant: '1' }, 'q-b')).toBe(false);
    expect(doitCompter({ ...OUVERTE, indexCourant: 9 }, 'q-b')).toBe(false);
  });
});
