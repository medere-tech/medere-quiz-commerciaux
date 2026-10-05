// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PageSujet } from '@/composants/parcours/PageSujet';
import { enFormation, type Formation } from '@/lib/formations/lecture';
import {
  fichesAffichees,
  fichesIndiscernables,
  identiteDuSujet,
  maitriseDuSujet,
  publicsDuSujet,
} from '@/lib/sujets/sujet';

/**
 * La page d'un sujet, dans chacun des états que Déthié a demandés : pas de
 * présentation, une fiche sans URL, un sujet dont une fiche sur trois est en
 * ligne, un sujet à une seule fiche — et la garde d'un sujet sans question,
 * atteint par adresse directe.
 *
 * Les propriétés sont calculées par les fonctions mêmes de la page
 * (`src/app/(parcours)/sujet/[id]/page.tsx`), pas posées à la main.
 *
 * **Ce que ce test ne voit pas : la mise en page.** happy-dom ne calcule
 * aucune géométrie. Les trois largeurs de la maquette se recettent au
 * navigateur — CLAUDE.md, « Un nœud qui existe ne dit rien de ce qu'on voit ».
 */

const SUJET = 'recSujetSommeil01';

function fiche(id: string, champs: Record<string, unknown> = {}): Formation {
  return enFormation(id, {
    nom: `Les troubles du sommeil, fiche ${id}`,
    numeroActionDpc: `9262${id.slice(-4)}`,
    cibles: ['Médecin généraliste'],
    format: 'E-Learning',
    modalite: 'Programme intégré',
    dureeTotale: '7',
    urlWebflow: `https://www.medere.fr/formations/${id}`,
    sujetId: SUJET,
    actif: true,
    ...champs,
  });
}

const PRESENTATION = {
  url: 'https://docs.google.com/presentation/d/abc/edit',
  presenteeLeMs: Date.UTC(2026, 8, 24, 10),
  presentePar: 'Noémie Vasseur',
};

function monter({
  fiches,
  questions = [{ id: 'q1', formationIds: [fiches[0]!.id] }],
  presentation = PRESENTATION,
}: {
  fiches: [Formation, ...Formation[]];
  questions?: { id: string; formationIds: string[] }[];
  presentation?: typeof PRESENTATION | null;
}) {
  const affichees = fichesAffichees(fiches);
  render(
    <PageSujet
      id={SUJET}
      nom="Troubles du sommeil"
      publics={publicsDuSujet(affichees)}
      forme={identiteDuSujet(fiches)}
      fiches={affichees}
      indiscernables={[...fichesIndiscernables(affichees)]}
      maitrise={maitriseDuSujet(
        questions,
        questions.map((question) => ({
          id: question.id,
          reussies: 0,
          dejaVue: false,
          derniereRatee: false,
        })),
        new Set(fiches.map((f) => f.id)),
      )}
      presentation={presentation}
    />,
  );
}

const texte = () => document.body.textContent ?? '';

afterEach(cleanup);

describe('Les deux gestes', () => {
  it('lance une série restreinte au sujet', () => {
    monter({ fiches: [fiche('recFiche000000001')] });

    const series = screen.getAllByRole('link', { name: /Lancer une série sur ce sujet/ });
    // Une fois dans le corps, une fois dans le pied du téléphone.
    expect(series).toHaveLength(2);
    for (const lien of series) expect(lien.getAttribute('href')).toBe(`/serie?sujet=${SUJET}`);
  });

  it('ouvre la présentation dans un nouvel onglet, et dit quand elle a été faite', () => {
    monter({ fiches: [fiche('recFiche000000001')] });

    const lien = screen.getAllByRole('link', { name: /Ouvrir la présentation/ })[0]!;
    expect(lien.getAttribute('href')).toBe(PRESENTATION.url);
    expect(lien.getAttribute('target')).toBe('_blank');
    expect(lien.getAttribute('rel')).toContain('noopener');
    expect(texte()).toContain('Présentée à l’équipe le 24 septembre par Noémie Vasseur.');
  });

  it('sans présentation : pas de bouton, et la page le dit', () => {
    monter({ fiches: [fiche('recFiche000000001')], presentation: null });

    expect(screen.queryAllByRole('link', { name: /Ouvrir la présentation/ })).toHaveLength(0);
    expect(texte()).toContain('Pas encore de présentation pour ce sujet');
  });

  it('GARDE — un sujet sans question, atteint par adresse : ni série ni maîtrise', () => {
    monter({ fiches: [fiche('recFiche000000001')], questions: [] });

    expect(screen.queryAllByRole('link', { name: /Lancer une série/ })).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: /Lancer une série/ })).toHaveLength(0);
    expect(texte()).not.toContain('de maîtrise');
    // La présentation, elle, reste à portée.
    expect(screen.getAllByRole('link', { name: /Ouvrir la présentation/ }).length).toBeGreaterThan(0);
  });
});

describe('Les fiches du catalogue', () => {
  it('une fiche sans URL : « Fiche pas encore en ligne », et aucun lien', () => {
    monter({ fiches: [fiche('recFiche000000001', { urlWebflow: '' })] });

    expect(texte()).toContain('Fiche pas encore en ligne');
    expect(screen.queryAllByRole('link', { name: /Voir la fiche sur medere.fr/ })).toHaveLength(0);
  });

  it('une fiche sur trois en ligne : le compte le dit, et une seule mène au site', () => {
    monter({
      fiches: [
        fiche('recFiche000000001', { format: 'Présentiel' }),
        fiche('recFiche000000002', { format: 'Classe virtuelle', urlWebflow: '' }),
        fiche('recFiche000000003', { format: 'E-Learning', urlWebflow: '' }),
      ],
    });

    expect(texte()).toContain('3 fiches, 1 en ligne');
    expect(screen.getAllByRole('link', { name: /Voir la fiche sur medere.fr/ })).toHaveLength(1);
    expect(texte().match(/Fiche pas encore en ligne/g)).toHaveLength(2);
  });

  it('un sujet à une seule fiche', () => {
    monter({ fiches: [fiche('recFiche000000001')] });

    expect(texte()).toContain('une seule fiche');
  });

  it('chaque fiche s’identifie par son titre, pas seulement par son format', () => {
    monter({
      fiches: [
        fiche('recFiche000000001', { format: 'Présentiel', nom: 'Les troubles du sommeil' }),
        fiche('recFiche000000002', {
          format: 'Présentiel',
          nom: 'Troubles du sommeil : les spécificités diagnostiques',
        }),
      ],
    });

    expect(texte()).toContain('Les troubles du sommeil');
    expect(texte()).toContain('Troubles du sommeil : les spécificités diagnostiques');
  });

  it('montre le format de la base : « Hybride », malgré « (E-learning) » dans le titre', () => {
    monter({
      fiches: [
        fiche('recFiche000000001', {
          format: 'Hybride',
          nom: 'Croissance et développement du petit enfant (E-learning)',
        }),
      ],
    });

    expect(screen.getByText('Hybride')).toBeTruthy();
    expect(screen.queryByText('E-learning')).toBeNull();
  });

  it('montre le numéro d’action DPC seulement quand il est le seul discriminant', () => {
    monter({
      fiches: [
        fiche('recFicheBipo00001', { format: 'Présentiel', numeroActionDpc: '92622325195' }),
        fiche('recFicheBipo00002', { format: 'Présentiel', numeroActionDpc: '92622525458' }),
        fiche('recFicheBipo00003', { format: 'E-Learning', numeroActionDpc: '92622425391' }),
      ],
    });

    expect(texte()).toContain('N° d’action DPC 92622325195');
    expect(texte()).toContain('N° d’action DPC 92622525458');
    expect(texte()).not.toContain('92622425391');
  });

  it('ajoute l’unité à une durée en nombre nu, et dit la modalité et le public', () => {
    monter({ fiches: [fiche('recFiche000000001', { dureeTotale: '8' })] });

    expect(texte()).toContain('Programme intégré · Médecin généraliste · 8 h');
  });

  it('ne montre pas une fiche retirée du catalogue', () => {
    monter({
      fiches: [
        fiche('recFiche000000001', { nom: 'Fiche au catalogue' }),
        fiche('recFiche000000002', { nom: 'Fiche suspendue', actif: false }),
      ],
    });

    expect(texte()).toContain('Fiche au catalogue');
    expect(texte()).not.toContain('Fiche suspendue');
  });
});
