// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * La saisie de la présentation d'un sujet, dans une carte de l'écran
 * Formations.
 *
 * Le dépôt est remplacé : ce qu'il fait sous les vraies règles est éprouvé
 * par `tests/depot/presentations.test.ts`. Ici, ce que l'écran décide seul —
 * refuser avant d'envoyer ce que les règles refuseraient, montrer ce qui a été
 * enregistré, demander confirmation avant de retirer.
 */

const enregistrerPresentation =
  vi.fn<typeof import('@/lib/sujets/depot').enregistrerPresentation>();
const retirerPresentation = vi.fn<typeof import('@/lib/sujets/depot').retirerPresentation>();

vi.mock(import('@/lib/sujets/depot'), () => ({ enregistrerPresentation, retirerPresentation }));

const signalerPanne = vi.fn<typeof import('@/lib/journal/client').signalerPanne>();
vi.mock(import('@/lib/journal/client'), () => ({ signalerPanne }));

const { PresentationSujet } = await import('@/composants/admin/PresentationSujet');

const SUJET = 'recSujetSommeil01';
const URL_SLIDES = 'https://docs.google.com/presentation/d/abc/edit';
const onModifiee = vi.fn();

function monter(presentation?: { url: string; presenteeLe: Date; presentePar: string }) {
  render(
    <PresentationSujet
      sujetId={SUJET}
      nomSujet="Troubles du sommeil"
      presentation={presentation}
      onModifiee={onModifiee}
    />,
  );
}

function saisir(url: string, jour: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Ajouter la présentation' }));
  fireEvent.change(screen.getByLabelText(/Lien de la présentation/), { target: { value: url } });
  fireEvent.change(screen.getByLabelText(/Présentée à l’équipe le/), { target: { value: jour } });
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
}

beforeEach(() => {
  enregistrerPresentation.mockImplementation(async (_sujet, url, presenteeLe) => ({
    url,
    presenteeLe,
    presentePar: 'Noémie Vasseur',
  }));
  retirerPresentation.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Saisir la présentation d’un sujet', () => {
  it('dit que le lien vaut pour toutes les fiches du sujet', () => {
    monter();
    expect(document.body.textContent).toContain('Sujet : Troubles du sommeil');
    expect(document.body.textContent).toContain('vaudra pour toutes les fiches de ce sujet');
  });

  it('enregistre un lien Slides, et le montre signé aussitôt', async () => {
    monter();
    saisir(URL_SLIDES, '2026-09-24');

    await waitFor(() => expect(enregistrerPresentation).toHaveBeenCalledTimes(1));
    const [sujet, url, presenteeLe] = enregistrerPresentation.mock.calls[0]!;
    expect([sujet, url]).toEqual([SUJET, URL_SLIDES]);
    // Midi à Paris : le 24 septembre reste le 24, quel que soit le fuseau.
    expect(presenteeLe.toISOString()).toBe('2026-09-24T10:00:00.000Z');
    expect(onModifiee).toHaveBeenCalledWith(SUJET, {
      url: URL_SLIDES,
      presenteeLe,
      presentePar: 'Noémie Vasseur',
    });
  });

  it('REFUS — un lien qui n’est ni Slides ni Drive n’est pas envoyé', async () => {
    monter();
    saisir('https://exemple.fr/presentation', '2026-09-24');

    expect(await screen.findByText(/Collez le lien de partage Google Slides ou Google Drive/)).toBeTruthy();
    expect(enregistrerPresentation).not.toHaveBeenCalled();
  });

  it('REFUS — une date à venir n’est pas envoyée', async () => {
    monter();
    saisir(URL_SLIDES, '2099-01-01');

    expect(await screen.findByText(/pas d’un jour à venir/)).toBeTruthy();
    expect(enregistrerPresentation).not.toHaveBeenCalled();
  });

  it('un refus de la base se dit, et remonte au journal sous son propre nom', async () => {
    enregistrerPresentation.mockRejectedValue(
      Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }),
    );
    monter();
    saisir(URL_SLIDES, '2026-09-24');

    expect(await screen.findByText(/La présentation n’a pas été enregistrée/)).toBeTruthy();
    expect((signalerPanne.mock.calls[0]?.[1] as Error).message).toBe(
      'Présentation non enregistrée (permission-denied) : Missing or insufficient permissions.',
    );
  });
});

describe('Retirer la présentation', () => {
  const existante = {
    url: URL_SLIDES,
    presenteeLe: new Date('2026-09-24T10:00:00Z'),
    presentePar: 'Noémie Vasseur',
  };

  it('demande confirmation avant de retirer', async () => {
    monter(existante);

    fireEvent.click(screen.getByRole('button', { name: 'Retirer' }));
    expect(retirerPresentation).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmer le retrait' }));
    await waitFor(() => expect(retirerPresentation).toHaveBeenCalledWith(SUJET));
    expect(onModifiee).toHaveBeenCalledWith(SUJET, null);
  });

  it('montre qui l’a saisie et quand', () => {
    monter(existante);
    expect(document.body.textContent).toContain('Présentée le 24 septembre 2026, saisie par Noémie Vasseur');
  });
});
