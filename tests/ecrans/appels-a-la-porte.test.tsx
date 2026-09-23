// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppelsALaPorte } from '@/composants/session/AppelsALaPorte';
import type { Appel } from '@/lib/session/depot';

/**
 * Ce que l'animatrice voit quand quelqu'un est resté dehors.
 *
 * **Le premier canal qui remonte de la salle**, et le seul endroit de l'outil
 * où quelqu'un qui n'est pas dans la pièce demande quelque chose. Ce que ces
 * tests gardent tient en trois points : elle voit qui attend, elle peut
 * répondre des deux façons sans quitter l'écran, et **rien ne reste affiché
 * une fois qu'elle a agi**.
 *
 * **Une séance hybride se partage par visioconférence : ce que Noémie voit, la
 * salle le voit.** Le bloc dit donc le strict nécessaire — un prénom, une
 * couleur, une attente — et jamais davantage.
 */

afterEach(cleanup);

function appel(remplacements: Partial<Appel> = {}): Appel {
  return {
    uid: 'u-jordan',
    nom: 'Jordan',
    avatar: 'turquoise',
    demandeLeMs: Date.now(),
    ...remplacements,
  };
}

function poser(
  appels: Appel[],
  presentation: 'salle' | 'panneau' = 'salle',
  verrouillee = true,
) {
  const onOuvrir = vi.fn();
  const onEcarter = vi.fn();
  render(
    <AppelsALaPorte
      appels={appels}
      presentation={presentation}
      verrouillee={verrouillee}
      onOuvrir={onOuvrir}
      onEcarter={onEcarter}
    />,
  );
  return { onOuvrir, onEcarter };
}

describe('à la porte', () => {
  /*
   * **Personne dehors : pas de bloc du tout.** Un encadré vide permanent sur
   * un écran projeté apprend à ne plus le regarder — et c'est précisément
   * l'écran qu'elle doit consulter le jour où quelqu'un frappe.
   */
  it('ne montre rien quand personne n’attend', () => {
    poser([]);

    expect(screen.queryByText('À la porte')).toBeNull();
  });

  it('nomme celui qui attend', () => {
    poser([appel()]);

    expect(screen.getByText('À la porte')).toBeTruthy();
    expect(screen.getByText('Jordan')).toBeTruthy();
    expect(screen.getByText('une personne attend')).toBeTruthy();
  });

  it('compte au pluriel', () => {
    poser([appel(), appel({ uid: 'u-sophie', nom: 'Sophie' })]);

    expect(screen.getByText('2 personnes attendent')).toBeTruthy();
  });

  /* Une attente qu'on ne chiffre pas paraît infinie ; à la seconde près, elle
     changerait sous les yeux de la salle sans rien apprendre. */
  it('dit depuis quand, à la minute', () => {
    poser([appel({ demandeLeMs: Date.now() - 3 * 60_000 })]);

    expect(screen.getByText('il y a 3 min')).toBeTruthy();
  });

  it('dit « à l’instant » avant la première minute', () => {
    poser([appel({ demandeLeMs: Date.now() - 5_000 })]);

    expect(screen.getByText('à l’instant')).toBeTruthy();
  });

  it('ouvre l’accès', () => {
    const { onOuvrir } = poser([appel()]);

    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir l’accès' }));

    expect(onOuvrir).toHaveBeenCalledTimes(1);
  });

  /*
   * **Le verrou est global, et l'écran le dit.** Admettre une personne rouvre
   * la porte pour tout le monde : sans cette phrase, Noémie croirait faire
   * entrer un seul retardataire.
   */
  it('prévient que rouvrir vaut pour tout le monde', () => {
    poser([appel()]);

    expect(screen.getByText(/rouvre la porte pour tout le monde/)).toBeTruthy();
  });

  it('écarte un appel sans rien ouvrir', () => {
    const { onOuvrir, onEcarter } = poser([appel()]);

    fireEvent.click(screen.getByRole('button', { name: 'Ignorer' }));

    expect(onEcarter).toHaveBeenCalledWith('u-jordan');
    expect(onOuvrir).not.toHaveBeenCalled();
  });

  it('propose d’écarter chaque appel séparément', () => {
    poser([appel(), appel({ uid: 'u-sophie', nom: 'Sophie' })]);

    expect(screen.getAllByRole('button', { name: 'Ignorer' })).toHaveLength(2);
  });

  /*
   * **Ce que le bloc ne doit pas dire.** Un appel nomme quelqu'un devant une
   * salle qui voit l'écran partagé. Ni adresse, ni identifiant, ni horaire
   * précis : un prénom, une couleur, une attente arrondie.
   */
  it('ne montre rien de plus que le nom et l’attente', () => {
    const { container } = render(
      <AppelsALaPorte
        appels={[appel()]}
        presentation="salle"
        verrouillee
        onOuvrir={vi.fn()}
        onEcarter={vi.fn()}
      />,
    );

    expect(container.textContent).not.toContain('u-jordan');
  });

  /*
   * **Porte ouverte, plus personne « à la porte ».** Vu au navigateur : une
   * fois l'accès rouvert, le bloc continuait d'annoncer deux personnes en
   * attente et offrait d'ouvrir une porte déjà ouverte. Les appels ne
   * s'effacent qu'à l'entrée de chacun — le bloc suit donc la porte, pas les
   * documents.
   */
  it('disparaît dès que la porte est ouverte, même si des appels traînent', () => {
    poser([appel(), appel({ uid: 'u-sophie', nom: 'Sophie' })], 'salle', false);

    expect(screen.queryByText('À la porte')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ouvrir l’accès' })).toBeNull();
  });

  it('se rend aussi en version compacte, dans le panneau de séance', () => {
    poser([appel()], 'panneau');

    expect(screen.getByText('Jordan')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ouvrir l’accès' })).toBeTruthy();
  });
});
