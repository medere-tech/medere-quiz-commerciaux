// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { rendre, session } from './aide';
import type { Session } from '@/lib/session/depot';

/*
 * Le panneau lit les séances qui contiennent la question. Le faux est écrit à
 * la forme `import('…')` : il est typé `Partial<typeof module>`, donc un faux
 * qui promettrait autre chose que le vrai ne compilerait plus.
 */
const seancesAVenirContenant = vi.fn<(questionId: string) => Promise<Session[]>>();

vi.mock(import('@/lib/session/depot'), () => ({
  seancesAVenirContenant: (questionId: string) => seancesAVenirContenant(questionId),
}));

const { SupprimerQuestion } = await import('@/composants/admin/SupprimerQuestion');

/**
 * 18 · La corbeille de la banque, et ce qu'elle demande avant d'effacer.
 *
 * **Ce que ces tests ne garderont pas, et il faut le dire.** Le défaut qui a
 * motivé ce composant était une superposition : trois libellés écrits dans une
 * colonne large de deux icônes, qui s'écrasaient les uns sur les autres. jsdom
 * ne met rien en page — il aurait trouvé les trois nœuds, dans le bon ordre,
 * avec les bons libellés, et serait resté vert. **Aucun test d'écran n'aurait
 * vu ce défaut.**
 *
 * Ce qu'ils gardent est autre chose, et c'est ce qui rend la superposition
 * impossible : les libellés ne vivent plus dans la rangée. Le jour où
 * quelqu'un les y ramène, `role="dialog"` disparaît et ces tests tombent.
 *
 * Le reste — la géométrie — se vérifie au navigateur, en regardant.
 */

beforeEach(() => {
  // Le cas ordinaire : la question n'est dans aucune séance à venir.
  seancesAVenirContenant.mockReset();
  seancesAVenirContenant.mockResolvedValue([]);
});

afterEach(cleanup);

/** Une séance à venir, nommée, qui contient la question. */
function seanceNommee(titre: string): Session {
  return session({ titre, statut: 'attente', demarree: false });
}

function monter(remplacements: Partial<Parameters<typeof SupprimerQuestion>[0]> = {}) {
  const onSupprimer = vi.fn<() => Promise<void>>().mockResolvedValue();
  const rendu = rendre(
    <SupprimerQuestion
      questionId="q1"
      enonce="Le DPC est-il obligatoire pour les chirurgiens-dentistes ?"
      enCours={false}
      onSupprimer={onSupprimer}
      {...remplacements}
    />,
  );
  return { onSupprimer, rendu };
}

describe('la corbeille de la banque', () => {
  it('n’efface pas au premier clic : elle ouvre un panneau qui nomme la question', async () => {
    const { onSupprimer } = monter();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Supprimer : Le DPC est-il obligatoire pour les chirurgiens-dentistes ?',
      }),
    );

    const panneau = screen.getByRole('dialog');
    expect(panneau).toBeTruthy();

    /* L'énoncé est cité : sur plusieurs centaines de rangées, « laquelle ? »
       est la seule question à laquelle le panneau doit répondre. */
    expect(
      screen.getByText('Le DPC est-il obligatoire pour les chirurgiens-dentistes ?'),
    ).toBeTruthy();

    // La conséquence est dite avant le geste, pas après.
    expect(screen.getByText(/il n’y a pas de corbeille/)).toBeTruthy();

    // Et rien n'est parti.
    expect(onSupprimer).not.toHaveBeenCalled();
  });

  it('annule sans rien effacer, et referme', async () => {
    const { onSupprimer } = monter();

    fireEvent.click(screen.getByRole('button', { name: /^Supprimer :/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(onSupprimer).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('efface lorsque la suppression est confirmée', async () => {
    const { onSupprimer } = monter();

    fireEvent.click(screen.getByRole('button', { name: /^Supprimer :/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));

    expect(onSupprimer).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  /*
   * **Un échec doit laisser le panneau ouvert.**
   *
   * S'il se refermait, la confirmation disparaîtrait en laissant croire que la
   * question est partie — alors qu'elle est toujours dans la liste, juste
   * derrière. C'est la raison pour laquelle `supprimer` relance l'erreur au
   * lieu de l'absorber.
   */
  it('reste ouvert quand l’effacement échoue', async () => {
    const onSupprimer = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('refus'));
    monter({ onSupprimer });

    fireEvent.click(screen.getByRole('button', { name: /^Supprimer :/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));

    expect(onSupprimer).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  /*
   * **Pendant l'écriture, plus aucune sortie.** Échap et « Annuler » sur une
   * suppression déjà partie laisseraient croire qu'elle est annulée, alors
   * qu'elle continue côté base.
   */
  it('éteint ses commandes tant que l’effacement est en vol', async () => {
    const { rendu, onSupprimer } = monter();

    fireEvent.click(screen.getByRole('button', { name: /^Supprimer :/ }));
    rendu.rerender(
      <SupprimerQuestion
        questionId="q1"
        enonce="Le DPC est-il obligatoire pour les chirurgiens-dentistes ?"
        enCours
        onSupprimer={onSupprimer}
      />,
    );

    expect(screen.getByRole('button', { name: 'Annuler' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Suppression…' }).hasAttribute('disabled')).toBe(
      true,
    );
  });
});

/**
 * L'avertissement des séances préparées.
 *
 * **La panne qu'il évite, et pourquoi elle est invisible sans lui.** Supprimer
 * une question ne touche pas aux séances : leur `questionIds` garde
 * l'identifiant. Le jeudi, la séance arrive dessus et projette « Cette
 * question n'est plus publiée » devant la salle. Rien ne plante — c'est
 * précisément le problème : aucune trace, aucun journal, et Noémie n'a aucun
 * moyen de relier ce trou à un clic d'il y a trois jours.
 */
describe('l’avertissement des séances préparées', () => {
  it('nomme la séance quand il n’y en a qu’une', async () => {
    seancesAVenirContenant.mockResolvedValue([seanceNommee('Séance du mardi 22 septembre')]);
    monter();

    fireEvent.click(screen.getByRole('button', { name: /^Supprimer :/ }));

    expect(
      await screen.findByText(/une séance qui n’a pas encore été jouée/),
    ).toBeTruthy();
    expect(screen.getByText(/« Séance du mardi 22 septembre »/)).toBeTruthy();
  });

  it('les nomme toutes quand elles sont deux ou trois', async () => {
    seancesAVenirContenant.mockResolvedValue([
      seanceNommee('Séance du mardi 22'),
      seanceNommee('Séance du jeudi 24'),
    ]);
    monter();

    fireEvent.click(screen.getByRole('button', { name: /^Supprimer :/ }));

    const texte = await screen.findByText(/2 séances qui n’ont pas encore été jouées/);
    expect(texte.textContent).toContain('« Séance du mardi 22 »');
    expect(texte.textContent).toContain('« Séance du jeudi 24 »');
  });

  /*
   * Au-delà de trois, la liste devient plus longue que la phrase, et ce qui
   * compte n'est plus « laquelle » mais « il y en a beaucoup ».
   */
  it('compte sans nommer au-delà de trois', async () => {
    seancesAVenirContenant.mockResolvedValue([
      seanceNommee('Séance A'),
      seanceNommee('Séance B'),
      seanceNommee('Séance C'),
      seanceNommee('Séance D'),
    ]);
    monter();

    fireEvent.click(screen.getByRole('button', { name: /^Supprimer :/ }));

    expect(await screen.findByText(/4 séances qui n’ont pas encore été jouées/)).toBeTruthy();
    expect(screen.queryByText(/« Séance A »/)).toBeNull();
  });

  it('ne dit rien quand aucune séance ne la contient', async () => {
    monter();

    fireEvent.click(screen.getByRole('button', { name: /^Supprimer :/ }));

    await waitFor(() => expect(seancesAVenirContenant).toHaveBeenCalledWith('q1'));
    expect(screen.queryByText(/pas encore été jouée/)).toBeNull();
  });

  /*
   * **Une lecture en échec ne devient pas « aucune séance ».** C'est le défaut
   * du `catch` qui rend une valeur normale, décrit dans CLAUDE.md : le silence
   * d'une panne prendrait l'apparence exacte d'une absence de danger.
   */
  it('dit qu’il n’a pas pu vérifier, plutôt que de se taire, si la lecture échoue', async () => {
    seancesAVenirContenant.mockRejectedValue(new Error('hors ligne'));
    monter();

    fireEvent.click(screen.getByRole('button', { name: /^Supprimer :/ }));

    /* Se taire rendrait l'échec indiscernable d'« aucune séance » : les deux
       laisseraient le panneau vide, et le silence d'une panne aurait
       l'apparence exacte d'une absence de danger. */
    expect(await screen.findByText(/Impossible de vérifier/)).toBeTruthy();
    expect(screen.queryByText(/pas encore été jouée/)).toBeNull();
    // Le panneau reste utilisable : on peut toujours annuler ou supprimer.
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeTruthy();
  });

  it('ne parle pas de vérification impossible quand la lecture aboutit', async () => {
    monter();

    fireEvent.click(screen.getByRole('button', { name: /^Supprimer :/ }));

    await waitFor(() => expect(seancesAVenirContenant).toHaveBeenCalledWith('q1'));
    expect(screen.queryByText(/Impossible de vérifier/)).toBeNull();
  });

  it('ne lit rien tant que le panneau n’est pas ouvert', () => {
    monter();

    expect(seancesAVenirContenant).not.toHaveBeenCalled();
  });
});
