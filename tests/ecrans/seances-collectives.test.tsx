// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { rendre } from './aide';
import type { Referentiel } from '@/composants/parcours/donnees';
import type { Session } from '@/lib/session/depot';
import { fausseAuth, fauxRouteur } from '../aide/faux';

/**
 * La liste des séances collectives — clore, et refuser d'en lancer deux.
 *
 * **Deux défauts que ces tests ferment, et ils vont ensemble.**
 *
 * *Le premier : la liste n'en montrait qu'une.* `find` prenait la première
 * séance vivante trouvée — chez Firestore, la première par identifiant. Avec
 * deux séances ouvertes, ce que rien n'empêche, la seconde était invisible :
 * donc impossible à clore depuis le seul écran où l'on constate le problème.
 *
 * *Le second : on ne pouvait pas la clore d'ici.* Arrêter une séance obligeait
 * à ouvrir l'écran d'animation — c'est-à-dire à projeter la séance qu'on
 * voulait justement fermer. Noémie voit le problème ici ; le geste est ici.
 *
 * Et les deux se rejoignent sur le refus de lancement : quand elle tombe sur
 * « une séance est déjà en cours », le geste pour la clore est dans la même
 * rangée, pas dans un autre écran.
 */

const mesSeances = vi.fn<() => Promise<Session[]>>();
const lancerSeance = vi.fn<() => Promise<void>>();
const terminerSession = vi.fn<() => Promise<void>>();
const abandonner = vi.fn<() => Promise<void>>();
const chargerBilan = vi.fn<() => Promise<null>>();
const pousser = vi.fn();

vi.mock(import('@/lib/firebase/client'), () => ({
  authentification: () => fausseAuth({ uid: 'uid-noemie', displayName: 'Noémie' }),
}));

vi.mock(import('next/navigation'), () => ({
  useRouter: () => fauxRouteur({ push: pousser }),
}));

vi.mock(import('@/lib/session/depot'), async (original) => {
  const vrai = await original<typeof import('@/lib/session/depot')>();
  return {
    ...vrai,
    mesSeances: () => mesSeances(),
    lancerSeance: () => lancerSeance(),
    terminerSession: () => terminerSession(),
    abandonner: () => abandonner(),
    chargerBilan: () => chargerBilan(),
    supprimerSeance: vi.fn(async () => {}),
  };
});

const { SeancesCollectives } = await import('@/composants/session/SeancesCollectives');

const REFERENTIEL = { questions: [], formations: [] } as unknown as Referentiel;

function seance(remplacements: Partial<Session> = {}): Session {
  return {
    id: 's1',
    code: 'JEUDI7',
    titre: 'Séance du jeudi',
    description: '',
    animateurNom: 'Noémie',
    animateurUid: 'uid-noemie',
    questionIds: ['q1', 'q2'],
    indexCourant: 0,
    revelee: false,
    demarree: false,
    verrouillee: false,
    statut: 'attente',
    repartition: [],
    repondants: 0,
    effectifAttendu: 0,
    dureeQuestionSecondes: 45,
    creeeLeMs: 1,
    ouverteLeMs: null,
    termineeLeMs: null,
    presentsFinal: 0,
    questionOuverteLeMs: null,
    ...remplacements,
  } as Session;
}

beforeEach(() => {
  mesSeances.mockReset().mockResolvedValue([]);
  lancerSeance.mockReset().mockResolvedValue();
  terminerSession.mockReset().mockResolvedValue();
  abandonner.mockReset().mockResolvedValue();
  chargerBilan.mockReset().mockResolvedValue(null);
  pousser.mockReset();
});

afterEach(cleanup);

async function monter() {
  rendre(<SeancesCollectives referentiel={REFERENTIEL} />);
  await screen.findByRole('heading', { name: 'Séances collectives' });
}

describe('les séances vivantes', () => {
  /*
   * **Toutes, pas la première trouvée.** Les identifiants sont choisis à
   * dessein : `AAAA-…` vient avant `ZZZZ-…` dans l'ordre de Firestore, donc
   * l'ancienne implémentation aurait montré l'oubliée et caché celle du jour.
   */
  it('montre les deux séances ouvertes, la dernière lancée d’abord', async () => {
    mesSeances.mockResolvedValue([
      seance({
        id: 'AAAA-oubliee',
        titre: 'Séance oubliée',
        statut: 'pause',
        demarree: true,
        ouverteLeMs: 1_000,
      }),
      seance({
        id: 'ZZZZ-du-jour',
        titre: 'Séance du jour',
        statut: 'encours',
        demarree: true,
        ouverteLeMs: 2_000,
      }),
    ]);
    await monter();

    expect(await screen.findByText(/Séance du jour - en cours/)).toBeTruthy();
    expect(screen.getByText(/Séance oubliée - en pause/)).toBeTruthy();

    // La dernière lancée passe devant : c'est celle qu'on anime.
    const titres = screen.getAllByText(/Séance (du jour|oubliée) - en/);
    expect(titres[0]?.textContent).toMatch(/du jour/);
  });

  it('propose d’arrêter chaque séance vivante, sans quitter l’écran', async () => {
    mesSeances.mockResolvedValue([
      seance({ id: 'a', titre: 'Première', statut: 'encours', demarree: true, ouverteLeMs: 2 }),
      seance({ id: 'b', titre: 'Seconde', statut: 'pause', demarree: true, ouverteLeMs: 1 }),
    ]);
    await monter();

    expect(await screen.findAllByRole('button', { name: /Arrêter la séance/ })).toHaveLength(2);
  });

  it('termine une séance depuis la liste', async () => {
    mesSeances.mockResolvedValue([
      seance({ statut: 'encours', demarree: true, ouverteLeMs: 1 }),
    ]);
    await monter();

    fireEvent.click(await screen.findByRole('button', { name: /Arrêter la séance/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Terminer/ }));

    await waitFor(() => expect(terminerSession).toHaveBeenCalledOnce());
    expect(abandonner).not.toHaveBeenCalled();
  });

  it('abandonne une séance depuis la liste', async () => {
    mesSeances.mockResolvedValue([
      seance({ statut: 'encours', demarree: true, ouverteLeMs: 1 }),
    ]);
    await monter();

    fireEvent.click(await screen.findByRole('button', { name: /Arrêter la séance/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Abandonner/ }));

    await waitFor(() => expect(abandonner).toHaveBeenCalledOnce());
    expect(terminerSession).not.toHaveBeenCalled();
  });
});

describe('lancer pendant qu’une séance tourne', () => {
  function avecUneVivanteEtUnePrete() {
    mesSeances.mockResolvedValue([
      seance({
        id: 's-vivante',
        titre: 'Séance du jeudi',
        statut: 'encours',
        demarree: true,
        ouverteLeMs: 1,
      }),
      seance({ id: 's-prete', titre: 'Séance prête', statut: 'attente' }),
    ]);
  }

  it('refuse, et nomme celle qui bloque', async () => {
    avecUneVivanteEtUnePrete();
    await monter();

    fireEvent.click(await screen.findByRole('button', { name: /^Lancer/ }));

    expect(
      await screen.findByText(/Une séance est déjà en cours : « Séance du jeudi »/),
    ).toBeTruthy();
    expect(lancerSeance).not.toHaveBeenCalled();
    expect(pousser).not.toHaveBeenCalled();
  });

  /*
   * **Le geste est dans la rangée qu'on vient de presser.** C'est la boucle
   * que le refus doit fermer : constater et régler au même endroit.
   */
  it('met les deux issues à portée, dans la rangée refusée', async () => {
    avecUneVivanteEtUnePrete();
    await monter();

    fireEvent.click(await screen.findByRole('button', { name: /^Lancer/ }));
    await screen.findByText(/Une séance est déjà en cours/);

    /* Deux panneaux d'arrêt à l'écran : celui de la carte du haut, et celui du
       refus. On prend le dernier — celui qui vient d'apparaître. */
    const arrets = screen.getAllByRole('button', { name: /Arrêter la séance/ });
    fireEvent.click(arrets[arrets.length - 1] as HTMLElement);

    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Terminer/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Abandonner/ })).toBeTruthy();
  });

  it('lance normalement quand aucune séance ne tourne', async () => {
    mesSeances.mockResolvedValue([seance({ id: 's-prete', statut: 'attente' })]);
    await monter();

    fireEvent.click(await screen.findByRole('button', { name: /^Lancer/ }));

    await waitFor(() => expect(lancerSeance).toHaveBeenCalledOnce());
    expect(screen.queryByText(/Une séance est déjà en cours/)).toBeNull();
  });
});
