import { FirebaseError } from 'firebase/app';
import { describe, expect, it } from 'vitest';

import { messageDeFenetre } from '@/lib/auth/messages-connexion';

/**
 * Ce que ces tests protègent : la distinction entre une fenêtre que le
 * navigateur a empêchée de s'ouvrir et une fenêtre que l'utilisateur a
 * refermée.
 *
 * Les deux se soldent par une absence de connexion, et un seul message les
 * couvrait : « la fenêtre s'est fermée avant la fin ». Dit à quelqu'un dont
 * le navigateur bloque les fenêtres surgissantes, ce message l'envoie
 * recliquer sur un bouton qui ne peut pas aboutir.
 */

function erreur(code: string): FirebaseError {
  return new FirebaseError(code, 'message du SDK, en anglais et instable');
}

describe('messageDeFenetre', () => {
  it('nomme le blocage du navigateur et dit quoi débloquer', () => {
    const message = messageDeFenetre(erreur('auth/popup-blocked'));

    expect(message).toContain('empêché');
    expect(message).toContain('fenêtres surgissantes');
  });

  it('ne parle de fermeture que lorsque la fenêtre a bien été fermée', () => {
    expect(messageDeFenetre(erreur('auth/popup-closed-by-user'))).toContain("s'est fermée");
    expect(messageDeFenetre(erreur('auth/user-cancelled'))).toContain("s'est fermée");

    // Le cas qui a motivé la correction : bloquée n'est pas fermée.
    expect(messageDeFenetre(erreur('auth/popup-blocked'))).not.toContain("s'est fermée");
  });

  it('renvoie un domaine non autorisé vers l’équipe technique, sans proposer de réessayer', () => {
    const message = messageDeFenetre(erreur('auth/unauthorized-domain'));

    expect(message).toContain('équipe technique');
    expect(message).not.toContain('réessayez');
    expect(message).not.toContain('Réessayez');
  });

  it('distingue une panne réseau des deux cas de fenêtre', () => {
    const message = messageDeFenetre(erreur('auth/network-request-failed'));

    expect(message).toContain('connexion');
    expect(message).not.toContain('fenêtre');
  });

  it('ne se fie pas au message du SDK, seulement à son code', () => {
    const trompeur = new FirebaseError('auth/network-request-failed', 'popup blocked by browser');

    expect(messageDeFenetre(trompeur)).not.toContain('surgissantes');
  });

  it('reste compréhensible devant une erreur qui ne vient pas du SDK', () => {
    expect(messageDeFenetre(new TypeError('boom'))).toContain("n'a pas abouti");
  });
});
