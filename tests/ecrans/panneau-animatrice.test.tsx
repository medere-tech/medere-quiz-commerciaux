// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { question } from './aide';
import { PanneauAnimatrice } from '@/composants/session/PanneauAnimatrice';
import type { Appel } from '@/lib/session/depot';

/**
 * La porte, pendant la séance.
 *
 * **Le trou que ces tests ferment, et il existait sans aucun retardataire.**
 * Noémie ferme l'accès dans la salle d'attente, puis lance la séance. L'écran
 * de séance ne portait alors *aucune* commande de verrou : elle n'avait plus
 * aucun moyen de rouvrir, sauf arrêter la séance devant la salle. Prévenir
 * l'animatrice n'aurait rien valu — la réponse n'existait pas.
 *
 * La commande vit dans le panneau et non sur la scène : la scène s'adresse à
 * la salle, pas à elle.
 */

afterEach(cleanup);

function poser(remplacements: { verrouillee?: boolean; appels?: Appel[] } = {}) {
  const onVerrouiller = vi.fn();
  const onEcarterAppel = vi.fn();
  render(
    <PanneauAnimatrice
      participants={[]}
      reponses={[]}
      question={question()}
      revelee={false}
      appels={remplacements.appels ?? []}
      verrouillee={remplacements.verrouillee ?? false}
      onVerrouiller={onVerrouiller}
      onEcarterAppel={onEcarterAppel}
    />,
  );
  return { onVerrouiller, onEcarterAppel };
}

describe('la porte pendant la séance', () => {
  it('dit que l’accès est ouvert, et propose de le fermer', () => {
    poser({ verrouillee: false });

    expect(screen.getByText('Accès ouvert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fermer' })).toBeTruthy();
  });

  it('dit que l’accès est fermé, et propose de l’ouvrir', () => {
    poser({ verrouillee: true });

    expect(screen.getByText('Accès fermé')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ouvrir' })).toBeTruthy();
  });

  /* C'est le geste qui manquait : sans lui, une porte fermée avant le
     lancement le restait jusqu'à la fin de la séance. */
  it('rouvre la porte sans quitter l’écran', () => {
    const { onVerrouiller } = poser({ verrouillee: true });

    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));

    expect(onVerrouiller).toHaveBeenCalledWith(false);
  });

  it('referme la porte', () => {
    const { onVerrouiller } = poser({ verrouillee: false });

    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));

    expect(onVerrouiller).toHaveBeenCalledWith(true);
  });

  /*
   * **La commande ne dépend pas d'un appel.** C'est le point : elle sert même
   * quand personne n'a frappé, et c'est ce cas-là qui coinçait Noémie.
   */
  it('reste disponible quand personne n’attend à la porte', () => {
    poser({ verrouillee: true, appels: [] });

    expect(screen.queryByText('À la porte')).toBeNull();
    expect(screen.getByRole('button', { name: 'Ouvrir' })).toBeTruthy();
  });

  it('montre les appels au-dessus des participants', () => {
    poser({
      verrouillee: true,
      appels: [{ uid: 'u1', nom: 'Jordan', avatar: 'bleu', demandeLeMs: Date.now() }],
    });

    expect(screen.getByText('À la porte')).toBeTruthy();
    expect(screen.getByText('Jordan')).toBeTruthy();
  });

  it('ouvre l’accès depuis le bloc des appels', () => {
    const { onVerrouiller } = poser({
      verrouillee: true,
      appels: [{ uid: 'u1', nom: 'Jordan', avatar: 'bleu', demandeLeMs: Date.now() }],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir l’accès' }));

    expect(onVerrouiller).toHaveBeenCalledWith(false);
  });
});
