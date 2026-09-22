import { describe, expect, it } from 'vitest';

import { estTri, LIBELLES_TRI, trierARevoir, TRIS, vuQuand } from '@/lib/serie/revision';

/**
 * Le tri et la date de l'écran « À revoir ».
 *
 * **Ce que ces tests gardent avant tout, c'est l'honnêteté de « Vu mardi ».**
 * Un jour de semaine ne désigne quelque chose que pendant une semaine : passé
 * ce délai, « mardi » vaut pour quatre mardis. Une date qui peut vouloir dire
 * n'importe quoi ressemble exactement à une date juste, et personne ne la
 * relit.
 */

/** Un mercredi, à Paris. */
const MERCREDI = new Date('2026-09-16T10:00:00+02:00');

function jours(n: number): Date {
  return new Date(MERCREDI.getTime() - n * 86_400_000);
}

describe('Depuis quand une question n’a pas été vue', () => {
  it('ne dit rien d’une question jamais vue', () => {
    expect(vuQuand(null, MERCREDI)).toBeNull();
  });

  it('dit « aujourd’hui » et « hier » plutôt que de les nommer', () => {
    expect(vuQuand(MERCREDI.getTime(), MERCREDI)).toBe('aujourd’hui');
    expect(vuQuand(jours(1).getTime(), MERCREDI)).toBe('hier');
  });

  /* C'est le cas de la maquette : « Vu mardi », deux jours plus tôt. */
  it('nomme le jour dans la semaine écoulée', () => {
    expect(vuQuand(jours(2).getTime(), MERCREDI)).toBe('lundi');
    expect(vuQuand(jours(5).getTime(), MERCREDI)).toBe('vendredi');
    expect(vuQuand(jours(6).getTime(), MERCREDI)).toBe('jeudi');
  });

  /*
   * **Le cas qui donne son sens à la borne.** Sept jours en arrière, c'est le
   * même jour de la semaine qu'aujourd'hui : « vu mercredi » un mercredi
   * désignerait aujourd'hui autant que la semaine dernière.
   */
  it('cesse de nommer le jour au-delà de six jours', () => {
    expect(vuQuand(jours(7).getTime(), MERCREDI)).toBe('le 9 septembre');
    expect(vuQuand(jours(30).getTime(), MERCREDI)).toBe('le 17 août');
  });

  /* Une horloge de navigateur en avance ne doit pas produire « vu demain ». */
  it('ne date rien dans le futur', () => {
    expect(vuQuand(MERCREDI.getTime() + 3 * 86_400_000, MERCREDI)).toBe('aujourd’hui');
  });

  /*
   * **Le jour se compte à Paris.** Vingt-trois heures trente heure de Paris,
   * c'est encore le même jour ; lu en UTC, ce serait déjà le lendemain.
   */
  it('compte les jours à Paris', () => {
    const tardLundi = new Date('2026-09-14T23:30:00+02:00');
    const mardiMatin = new Date('2026-09-15T08:00:00+02:00');
    expect(vuQuand(tardLundi.getTime(), mardiMatin)).toBe('hier');
  });
});

/* ------------------------------------------------------------------- le tri */

const LIGNES = [
  { id: 'q-a', echecs: 1, vueLeMs: jours(1).getTime(), formation: 'Vaccination' },
  { id: 'q-b', echecs: 3, vueLeMs: jours(5).getTime(), formation: 'Prééclampsie' },
  { id: 'q-c', echecs: 3, vueLeMs: jours(2).getTime(), formation: 'Prééclampsie' },
  { id: 'q-d', echecs: 2, vueLeMs: null, formation: 'Urgences' },
];

describe('Le tri', () => {
  it('compte trois tris, tous nommés', () => {
    expect(TRIS).toEqual(['echecs', 'anciennete', 'formation']);
    for (const tri of TRIS) expect(LIBELLES_TRI[tri]).toBeTruthy();
  });

  it('met les plus ratées en tête', () => {
    expect(trierARevoir(LIGNES, 'echecs').map((ligne) => ligne.id)).toEqual([
      'q-b',
      'q-c',
      'q-d',
      'q-a',
    ]);
  });

  it('met les plus anciennes en tête, jamais vue d’abord', () => {
    expect(trierARevoir(LIGNES, 'anciennete').map((ligne) => ligne.id)).toEqual([
      'q-d',
      'q-b',
      'q-c',
      'q-a',
    ]);
  });

  it('groupe par formation, les plus ratées d’abord dans chacune', () => {
    expect(trierARevoir(LIGNES, 'formation').map((ligne) => ligne.id)).toEqual([
      'q-b',
      'q-c',
      'q-d',
      'q-a',
    ]);
  });

  /*
   * **Une liste qui saute sous le doigt est une liste qu'on n'utilise pas.**
   * Deux questions à égalité doivent se départager par une valeur stable, sinon
   * leur ordre dépend de celui d'arrivée — qui change d'un rendu à l'autre.
   */
  it('départage les égalités de façon stable', () => {
    const melange = [...LIGNES].reverse();
    for (const tri of TRIS) {
      expect(trierARevoir(melange, tri).map((l) => l.id)).toEqual(
        trierARevoir(LIGNES, tri).map((l) => l.id),
      );
    }
  });

  it('ne touche pas au tableau reçu', () => {
    const avant = LIGNES.map((ligne) => ligne.id);
    trierARevoir(LIGNES, 'anciennete');
    expect(LIGNES.map((ligne) => ligne.id)).toEqual(avant);
  });

  it('ne reconnaît que les trois tris', () => {
    expect(estTri('echecs')).toBe(true);
    expect(estTri('au-hasard')).toBe(false);
  });
});
