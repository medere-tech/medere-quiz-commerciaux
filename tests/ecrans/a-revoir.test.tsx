// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { question } from './aide';
import type { Question } from '@/lib/questions/lecture';
import { fausseAuth, fausseIntention, fausseRequete, fauxRouteur } from '../aide/faux';

/**
 * 05 · Questions à revoir.
 *
 * **Trois choses arrivent sur cet écran au 16, et chacune peut mentir en
 * silence.** Le tri réordonne une liste sans rien dire de ce qu'il a fait ; la
 * date de dernière vue est une date, et une date fausse ressemble exactement à
 * une date juste ; « Retravailler » ouvre une question et ne doit pas ouvrir la
 * mauvaise.
 *
 * Interrogation par rôle et par texte visible.
 */

/* ------------------------------------------------ le monde autour de l'écran */

type EtatSeme = {
  id: string;
  reussies: number;
  tentatives: number;
  derniereRatee: boolean;
  vueLeMs: number | null;
};

let etatsSemes: EtatSeme[] = [];

vi.mock(import('@/lib/serie/depot'), async (original) => {
  const vrai = await original<typeof import('@/lib/serie/depot')>();
  return {
    ...vrai,
    chargerMesEtats: async () =>
      new Map(
        etatsSemes.map((etat) => [
          etat.id,
          { ...etat, dejaVue: etat.tentatives > 0 },
        ]),
      ),
    chargerProgression: async () => ({
      etoiles: 0,
      seriesTerminees: 0,
      assiduite: { dernierJour: '', serie: 0, record: 0, semaine: [] },
      recompenses: {},
    }),
  };
});

vi.mock(import('@/lib/firebase/client'), () => ({
  authentification: () => fausseAuth({ uid: 'uid-jordan', displayName: 'Jordan' }),
}));

/*
 * L'adresse est tenue par le test, et elle **ne bouge jamais** — c'est le
 * comportement réel, pas une commodité. `definir` passe par
 * `history.replaceState`, et le vrai `useSearchParams` de Next 16.3.4 ne
 * provoque aucun rendu dans ce cas : l'écran ne suit que parce que
 * `useParametresUrl` garde la valeur choisie dans un état React.
 *
 * Ce commentaire disait le contraire, et c'était faux. Le faux prétendait que
 * `useSearchParams` voyait la nouvelle valeur ; les tests passaient, et le
 * filtre était cassé sur quatre écrans. Voir `CLAUDE.md`, « un faux qui rend ce
 * qui arrange ne prouve rien », et `tests/navigation/parametres-url.test.tsx`,
 * qui garde le comportement lui-même.
 */
let adresse = fausseRequete();
const naviguer = vi.fn();

vi.mock(import('next/navigation'), () => ({
  useRouter: () => fauxRouteur({ push: naviguer, replace: naviguer }),
  usePathname: () => '/a-revoir',
  useSearchParams: () => adresse,
}));

vi.mock(import('@/lib/navigation/intention'), () => fausseIntention());

const { ARevoir } = await import('@/composants/parcours/ARevoir');

const FORMATIONS = [
  {
    id: 'f-1',
    airtableId: 'rec1',
    numeroActionDpc: '99000001',
    nom: 'Urgences au cabinet dentaire',
    cibles: ['Chirurgien-dentiste'],
    format: 'Présentiel',
    modalite: 'Formation continue',
    blocsCertification: ['1'],
    dureeTotale: '14 heures',
    urlWebflow: '',
    actif: true,
    syncLe: null,
  },
  {
    id: 'f-2',
    airtableId: 'rec2',
    numeroActionDpc: '99000002',
    nom: 'Actualités vaccinales',
    cibles: ['Médecin'],
    format: 'E-Learning',
    modalite: 'Formation continue',
    blocsCertification: ['1'],
    dureeTotale: '6 heures',
    urlWebflow: '',
    actif: true,
    syncLe: null,
  },
];

const JOUR = 86_400_000;

/** Trois questions ratées, de formations, d'échecs et d'ancienneté différents. */
function banque(): Question[] {
  return [
    question({ id: 'q-vieille', enonce: 'La plus ancienne ?', formationIds: ['f-2'] }),
    question({ id: 'q-ratee', enonce: 'La plus ratée ?', formationIds: ['f-1'] }),
    question({ id: 'q-fraiche', enonce: 'La plus fraîche ?', formationIds: ['f-1'] }),
    question({ id: 'q-juste', enonce: 'Celle qui est acquise ?', formationIds: ['f-1'] }),
  ];
}

function semer(maintenant = Date.now()) {
  etatsSemes = [
    // Deux échecs, vue il y a dix jours.
    { id: 'q-vieille', reussies: 1, tentatives: 3, derniereRatee: true, vueLeMs: maintenant - 10 * JOUR },
    // Quatre échecs, vue il y a trois jours.
    { id: 'q-ratee', reussies: 0, tentatives: 4, derniereRatee: true, vueLeMs: maintenant - 3 * JOUR },
    // Un échec, vue hier.
    { id: 'q-fraiche', reussies: 2, tentatives: 3, derniereRatee: true, vueLeMs: maintenant - JOUR },
    // Dernière tentative juste : elle n'est pas dans la liste.
    { id: 'q-juste', reussies: 2, tentatives: 2, derniereRatee: false, vueLeMs: maintenant },
  ];
}

async function monter(questions = banque()) {
  const { render } = await import('@testing-library/react');
  await act(async () => {
    render(<ARevoir referentiel={{ questions, formations: FORMATIONS }} />);
  });
  await waitFor(() => expect(screen.getByText('La plus ratée ?')).toBeTruthy());
}

/** Les énoncés, dans l'ordre où l'écran les pose. */
function ordreAffiche(): string[] {
  return screen
    .getAllByRole('link', { name: 'Retravailler' })
    .map((lien) => lien.closest('div')?.querySelector('span span')?.textContent ?? '');
}

beforeEach(() => {
  adresse = fausseRequete();
  naviguer.mockReset();
  semer();
});

afterEach(cleanup);

/* --------------------------------------------------------------- « Vu … » */

describe('La date de dernière vue', () => {
  it('nomme le jour quand il est dans la semaine, et date au-delà', async () => {
    await monter();
    expect(screen.getByText('Vu hier')).toBeTruthy();
    // Dix jours en arrière : un jour de semaine ne désignerait plus rien.
    expect(screen.getByText(/^Vu le /)).toBeTruthy();
  });

  /* Un état écrit avant que `majLe` existe n'en porte pas : on n'invente pas
     de tiret, la colonne reste vide. */
  it('n’affiche rien quand la date manque', async () => {
    semer();
    etatsSemes = etatsSemes.map((etat) =>
      etat.id === 'q-ratee' ? { ...etat, vueLeMs: null } : etat,
    );
    await monter();

    const sansDate = screen.getByText('La plus ratée ?').closest('.ligne-tableau')!;
    expect(within(sansDate as HTMLElement).queryByText(/^Vu /)).toBeNull();

    // Les autres gardent la leur : c'est bien la date manquante qui se tait.
    const avecDate = screen.getByText('La plus fraîche ?').closest('.ligne-tableau')!;
    expect(within(avecDate as HTMLElement).getByText('Vu hier')).toBeTruthy();
  });
});

/* ------------------------------------------------------------------- le tri */

describe('Le tri', () => {
  it('trie par erreurs répétées par défaut', async () => {
    await monter();
    expect(ordreAffiche()).toEqual(['La plus ratée ?', 'La plus ancienne ?', 'La plus fraîche ?']);
  });

  /*
   * **Le point qui coûte, et il ne se voit pas à l'écran.** Changer le tri ne
   * doit rien relire : la liste entière est déjà en mémoire, et l'adresse se
   * pose par l'historique du navigateur. Une navigation ici redemanderait au
   * serveur la banque complète, puis relirait les états et la progression.
   */
  it('réordonne sans naviguer', async () => {
    await monter();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Trier les questions à revoir'), {
        target: { value: 'anciennete' },
      });
    });

    expect(naviguer).not.toHaveBeenCalled();
  });

  it('met les plus anciennes en tête quand on le lui demande', async () => {
    adresse = fausseRequete('tri=anciennete');
    await monter();
    expect(ordreAffiche()).toEqual(['La plus ancienne ?', 'La plus ratée ?', 'La plus fraîche ?']);
  });

  it('groupe par formation', async () => {
    adresse = fausseRequete('tri=formation');
    await monter();
    // « Actualités vaccinales » avant « Urgences au cabinet dentaire ».
    expect(ordreAffiche()[0]).toBe('La plus ancienne ?');
  });

  /* Une adresse se modifie à la main : un tri inventé retombe sur le défaut
     plutôt que de vider la liste. */
  it('ignore un tri inconnu dans l’adresse', async () => {
    adresse = fausseRequete('tri=au-hasard');
    await monter();
    expect(ordreAffiche()).toEqual(['La plus ratée ?', 'La plus ancienne ?', 'La plus fraîche ?']);
  });
});

/* --------------------------------------------------------- « Retravailler » */

describe('« Retravailler »', () => {
  it('ouvre la question de sa propre ligne', async () => {
    await monter();

    const liens = screen.getAllByRole('link', { name: 'Retravailler' });
    expect(liens[0]?.getAttribute('href')).toBe('/serie?question=q-ratee');
  });

  /* Les questions dont la dernière tentative est juste ne sont pas là, et
     n'ont donc pas de bouton. */
  it('n’en pose pas sur une question acquise', async () => {
    await monter();
    expect(screen.queryByText('Celle qui est acquise ?')).toBeNull();
    expect(screen.getAllByRole('link', { name: 'Retravailler' })).toHaveLength(3);
  });
});
