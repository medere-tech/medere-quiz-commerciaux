// @vitest-environment happy-dom
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { question } from './aide';
import type { Question } from '@/lib/questions/lecture';
import type { Assiduite } from '@/lib/serie/assiduite';
import { fausseAuth, fausseIntention, fausseRequete, fauxRouteur } from '../aide/faux';

/**
 * 01 · Accueil — le premier jour.
 *
 * **Ce que ces tests gardent : aucune phrase ne prête un passé à qui n'en a
 * pas.** Vu sur la base vide au lendemain de la mise en service, sur le premier
 * écran que dix commerciaux ouvrent : « 0 question sur 0 acquise : votre
 * dernière réponse y était juste », « Lancer une série de 0 », « À reprendre »
 * pour une série jamais commencée. Trois situations, trois phrases :
 *
 * 1. rien n'est publié ;
 * 2. des questions sont publiées, aucune n'a été vue ;
 * 3. on a joué.
 */

type EtatSeme = { id: string; reussies: number; tentatives: number; derniereRatee: boolean };

let etatsSemes: EtatSeme[] = [];
let assiduite: Assiduite = { dernierJour: '', serie: 0, record: 0, semaine: [] };

vi.mock(import('@/lib/serie/depot'), async (original) => {
  const vrai = await original<typeof import('@/lib/serie/depot')>();
  return {
    ...vrai,
    chargerMesEtats: async () =>
      new Map(etatsSemes.map((etat) => [etat.id, { ...etat, dejaVue: etat.tentatives > 0, vueLeMs: null }])),
    chargerProgression: async () => ({
      etoiles: 0,
      seriesTerminees: 0,
      assiduite,
      recompenses: {},
    }),
  };
});

/* Les deux encarts de séance lisent Firestore : sans séance ni prix, ils se
   taisent, comme sur la base vide. */
vi.mock(import('@/lib/session/depot'), async (original) => {
  const vrai = await original<typeof import('@/lib/session/depot')>();
  return {
    ...vrai,
    seanceOuverte: async () => null,
    prochaineSeance: async () => null,
    chargerMesPrix: async () => [],
  };
});

vi.mock(import('@/lib/firebase/client'), () => ({
  authentification: () => fausseAuth({ uid: 'uid-jordan', displayName: 'Jordan' }),
}));

vi.mock(import('next/navigation'), () => ({
  useRouter: () => fauxRouteur(),
  usePathname: () => '/',
  useSearchParams: () => fausseRequete(),
}));

vi.mock(import('@/lib/navigation/intention'), () => fausseIntention());

const { Accueil } = await import('@/composants/parcours/Accueil');

const FORMATION = {
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
};

function banque(nombre: number): Question[] {
  return Array.from({ length: nombre }, (_, i) =>
    question({ id: `q${i}`, enonce: `Énoncé ${i} ?`, formationIds: ['f-1'] }),
  );
}

async function monter(questions: Question[]) {
  const { render } = await import('@testing-library/react');
  await act(async () => {
    render(<Accueil prenom="Jordan" referentiel={{ questions, formations: [FORMATION] }} />);
  });
  await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeTruthy());
}

/** Le texte de l'écran, d'un seul tenant : une phrase peut être découpée en nœuds. */
function texte(): string {
  return document.body.textContent ?? '';
}

beforeEach(() => {
  etatsSemes = [];
  assiduite = { dernierJour: '', serie: 0, record: 0, semaine: [] };
});

afterEach(cleanup);

describe('Rien n’est publié', () => {
  it('le dit, sans maîtrise à 0 % ni série de 0', async () => {
    await monter([]);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/aucune question n’est encore publiée/i);
    expect(texte()).not.toMatch(/0 % du catalogue/);
    expect(texte()).not.toMatch(/série de 0/);
    expect(texte()).not.toMatch(/dernière réponse/);
    expect(screen.getAllByText('Aucune question à jouer').length).toBeGreaterThan(0);
  });

  it('ne fixe pas un objectif impossible, et ne parle pas de reprendre', async () => {
    await monter([]);

    expect(texte()).toMatch(/En attente des premières questions/);
    expect(texte()).not.toMatch(/Une série de 10/);
    expect(texte()).not.toMatch(/À reprendre/);
    expect(texte()).toMatch(/À commencer/);
  });
});

describe('Des questions sont publiées, aucune n’a été vue', () => {
  it('donne la définition au présent, sans « votre dernière réponse y était juste »', async () => {
    await monter(banque(15));

    expect(texte()).toMatch(/15 questions au catalogue, aucune encore vue/);
    expect(texte()).not.toMatch(/y était juste|y étaient justes/);
    expect(screen.getAllByText('Lancer une série de 10').length).toBeGreaterThan(0);
  });

  it('propose une série à la taille de la banque quand elle est plus petite', async () => {
    await monter(banque(4));

    expect(screen.getAllByText('Lancer une série de 4').length).toBeGreaterThan(0);
    expect(texte()).toMatch(/Une série de 4, avant midi/);
  });

  it('dit « à commencer », pas « à reprendre », tant qu’aucun jour n’a été joué', async () => {
    await monter(banque(15));
    expect(texte()).toMatch(/À commencer/);
    expect(texte()).not.toMatch(/À reprendre/);
  });
});

describe('On a joué', () => {
  it('ne dit pas « 0 question acquise : votre dernière réponse y était juste »', async () => {
    etatsSemes = [{ id: 'q0', reussies: 0, tentatives: 1, derniereRatee: true }];
    await monter(banque(15));

    expect(texte()).toMatch(/Aucune question acquise sur 15 pour l’instant/);
    expect(texte()).not.toMatch(/y était juste/);
    expect(texte()).toMatch(/1 attend une nouvelle tentative/);
  });

  it('garde la phrase d’origine dès qu’une question est acquise', async () => {
    etatsSemes = [{ id: 'q0', reussies: 1, tentatives: 1, derniereRatee: false }];
    await monter(banque(15));

    expect(texte()).toMatch(/1 question sur 15 acquise : votre dernière réponse y était juste/);
  });

  it('dit « à reprendre » une série interrompue, record à l’appui', async () => {
    assiduite = { dernierJour: '2026-01-05', serie: 3, record: 3, semaine: [] };
    await monter(banque(15));

    expect(texte()).toMatch(/À reprendre/);
  });
});
