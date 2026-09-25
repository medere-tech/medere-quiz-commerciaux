// @vitest-environment happy-dom
import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { rendre } from './aide';
import type { MonRang, Podium } from '@/lib/serie/podium';
import { fausseApplication, fausseAuth } from '../aide/faux';

/**
 * 04b · Récompenses et équipe — ce que l'écran montre, et ce qu'il tait.
 *
 * **Le bloc Équipe est l'écart assumé sur la maquette**, et c'est lui que ces
 * tests gardent. La maquette dessine un classement complet de l'équipe sur le
 * taux de maîtrise ; on publie un podium sur la régularité. Trois noms, et
 * rien qui permette d'en déduire un quatrième.
 *
 * Les seuils eux-mêmes sont tenus côté serveur — c'est là qu'ils doivent
 * l'être, un client ne se garde pas lui-même. Ici on vérifie **ce que l'écran
 * fait de ce qu'on lui donne** : qu'il se reconnaît, qu'il dit le rang avec
 * l'écart, et qu'il se tait quand il n'y a rien à dire.
 */

const chargerPodium = vi.fn<() => Promise<Podium | null>>();
const chargerMonRang = vi.fn<() => Promise<MonRang | null>>();

vi.mock(import('@/lib/firebase/client'), () => ({
  authentification: () => fausseAuth({ uid: 'moi', displayName: 'Camille Roux' }),
  applicationFirebase: () => fausseApplication(),
}));

vi.mock(import('@/lib/serie/podium'), async (original) => {
  const vrai = await original<typeof import('@/lib/serie/podium')>();
  return {
    ...vrai,
    chargerPodium: () => chargerPodium(),
    chargerMonRang: () => chargerMonRang(),
  };
});

const { Recompenses } = await import('@/composants/parcours/Recompenses');

const AUJOURDHUI = new Date();

/** Le jour d'aujourd'hui en `AAAA-MM-JJ`, à Paris. */
function jour(): string {
  const parties = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(AUJOURDHUI);
  const lire = (type: string) => parties.find((partie) => partie.type === type)?.value ?? '';
  return `${lire('year')}-${lire('month')}-${lire('day')}`;
}

function ligne(uid: string, nom: string, rang: number, serie: number) {
  return { uid, nom, avatar: 'bleu', rang, serie, dernierJour: jour() };
}

const REFERENTIEL = { questions: [], formations: [] } as never;

function parcours() {
  return {
    uid: 'moi',
    etats: [],
    progression: {
      assiduite: { dernierJour: jour(), serie: 4, record: 9, semaine: [jour()] },
      recompenses: {},
      etoiles: 0,
      seriesTerminees: 0,
    },
  } as never;
}

beforeEach(() => {
  chargerPodium.mockReset().mockResolvedValue({ lignes: [], autresAuDernierRang: 0 });
  chargerMonRang.mockReset().mockResolvedValue(null);
});

afterEach(cleanup);

function monter() {
  rendre(<Recompenses referentiel={REFERENTIEL} parcours={parcours()} />);
}

describe('l’écran', () => {
  it('annonce le compte de récompenses obtenues', async () => {
    monter();

    expect(await screen.findByRole('heading', { name: 'Vos récompenses' })).toBeTruthy();
  });

  it('montre la série en cours et le record', async () => {
    monter();

    expect(await screen.findByText('4 jours')).toBeTruthy();
    expect(screen.getByText(/votre record est de 9/)).toBeTruthy();
  });

  /* L'action du pouce suit la série : promettre « cinq jours » à quelqu'un qui
     en est à zéro serait faux. */
  it('propose de passer au jour suivant', async () => {
    monter();

    expect(await screen.findByRole('link', { name: /Passer à 5 jours/ })).toBeTruthy();
  });
});

describe('le bloc équipe', () => {
  it('nomme les trois du podium, avec leur régularité', async () => {
    chargerPodium.mockResolvedValue({
      lignes: [ligne('a', 'Yanis', 1, 7), ligne('b', 'Léa', 2, 5), ligne('c', 'Marc', 3, 3)],
      autresAuDernierRang: 0,
    });
    monter();

    expect(await screen.findByText('Yanis')).toBeTruthy();
    expect(screen.getByText('Léa')).toBeTruthy();
    expect(screen.getByText('Marc')).toBeTruthy();
  });

  /*
   * **Se reconnaître d'un coup d'œil, aux deux largeurs.** C'est la convention
   * du classement de séance — `RevelationClassement` écrit déjà « · vous » —
   * et deux conventions pour la même idée seraient une de trop.
   */
  it('marque sa propre ligne', async () => {
    chargerPodium.mockResolvedValue({
      lignes: [ligne('a', 'Yanis', 1, 7), ligne('moi', 'Camille', 2, 5), ligne('c', 'Marc', 3, 3)],
      autresAuDernierRang: 0,
    });
    monter();

    expect(await screen.findByText(/Camille · vous/)).toBeTruthy();
  });

  /* Qui est au podium n'a pas d'écart à combler : sa ligne le dit déjà. Le
     redire serait deux fois la même information. */
  it('ne répète pas le rang de qui figure au podium', async () => {
    chargerPodium.mockResolvedValue({
      lignes: [ligne('moi', 'Camille', 1, 7), ligne('b', 'Léa', 2, 5), ligne('c', 'Marc', 3, 3)],
      autresAuDernierRang: 0,
    });
    chargerMonRang.mockResolvedValue({ rang: 1, ecart: null });
    monter();

    await screen.findByText(/Camille · vous/);
    expect(screen.queryByText(/pour entrer au podium/)).toBeNull();
  });

  /*
   * **Le rang et l'écart ensemble.** Le rang sans l'écart ne dit pas quoi
   * faire ; l'écart sans le rang ne dit pas où l'on est.
   */
  it('dit son rang et ce qui le sépare du podium', async () => {
    chargerPodium.mockResolvedValue({
      lignes: [ligne('a', 'Yanis', 1, 7), ligne('b', 'Léa', 2, 5), ligne('c', 'Marc', 3, 4)],
      autresAuDernierRang: 0,
    });
    chargerMonRang.mockResolvedValue({ rang: 5, ecart: 2 });
    monter();

    expect(await screen.findByText('5e · 2 jours de plus pour entrer au podium')).toBeTruthy();
  });

  it('accorde au singulier', async () => {
    chargerPodium.mockResolvedValue({
      lignes: [ligne('a', 'Yanis', 1, 7), ligne('b', 'Léa', 2, 5), ligne('c', 'Marc', 3, 4)],
      autresAuDernierRang: 0,
    });
    chargerMonRang.mockResolvedValue({ rang: 4, ecart: 1 });
    monter();

    expect(await screen.findByText('4e · un jour de plus pour entrer au podium')).toBeTruthy();
  });

  /*
   * **Sous le seuil, l'écran se tait et dit pourquoi.** Nommer deux personnes
   * un lundi matin reviendrait à nommer les huit autres par soustraction.
   */
  it('explique l’absence de podium au lieu de laisser un vide', async () => {
    monter();

    expect(
      await screen.findByText(/dès que trois personnes ont une série en cours/),
    ).toBeTruthy();
  });

  it('compte les ex æquo non nommés', async () => {
    chargerPodium.mockResolvedValue({
      lignes: [ligne('a', 'Yanis', 1, 9), ligne('b', 'Léa', 2, 7)],
      autresAuDernierRang: 5,
    });
    monter();

    expect(await screen.findByText(/5 autres à égalité/)).toBeTruthy();
  });

  /*
   * **Une série périmée s'affiche à zéro, pas à sa valeur d'hier.** Le podium
   * n'est recalculé que lorsque quelqu'un joue : entre deux écritures, celle
   * de qui s'est arrêté continue de descendre. Un nombre périmé vers le haut
   * serait pire que pas de podium.
   */
  it('recalcule la péremption à la lecture', async () => {
    chargerPodium.mockResolvedValue({
      lignes: [
        { uid: 'a', nom: 'Yanis', avatar: 'bleu', rang: 1, serie: 12, dernierJour: '2026-01-05' },
        ligne('b', 'Léa', 2, 5),
        ligne('c', 'Marc', 3, 3),
      ],
      autresAuDernierRang: 0,
    });
    monter();

    await screen.findByText('Yanis');
    // Douze jours stockés, mais la série est morte depuis longtemps.
    await waitFor(() => expect(screen.queryByText('12 j')).toBeNull());
  });

  /* Le bloc équipe est un supplément : l'écran des récompenses reste entier
     sans lui, et un podium absent se dit plutôt qu'il ne ment. */
  it('reste utilisable quand le podium ne se lit pas', async () => {
    chargerPodium.mockRejectedValue(new Error('hors ligne'));
    monter();

    expect(await screen.findByRole('heading', { name: 'Vos récompenses' })).toBeTruthy();
    expect(await screen.findByText(/dès que trois personnes/)).toBeTruthy();
  });
});
