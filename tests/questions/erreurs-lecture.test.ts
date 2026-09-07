import { FirebaseError } from 'firebase/app';
import { describe, expect, it, vi } from 'vitest';

import { echecDeLecture } from '@/lib/firebase/erreurs';

/**
 * Ce que ces tests protègent : la distinction entre « la base refuse » et
 * « la base n'a pas répondu ».
 *
 * Le 3 septembre 2026, les règles publiées refusaient toute lecture depuis un
 * navigateur et les trois écrans du back-office affichaient « le chargement a
 * échoué » avec un bouton « Réessayer ». Le message décrivait le symptôme, le
 * bouton promettait une issue qui n'existait pas. Un refus des règles ne se
 * réessaie pas.
 */

// Le helper journalise le code d'erreur pour la console de développement :
// on ne veut pas de ce bruit dans la sortie des tests.
vi.spyOn(console, 'error').mockImplementation(() => {});

function erreurFirebase(code: string): FirebaseError {
  return new FirebaseError(code, 'message du SDK, en anglais et instable');
}

describe('echecDeLecture', () => {
  it('nomme le refus des règles et retire le bouton Réessayer', () => {
    const echec = echecDeLecture(erreurFirebase('permission-denied'), 'la banque de questions');

    expect(echec.reessayable).toBe(false);
    expect(echec.texte).toContain('règles de sécurité');
    expect(echec.texte).toContain('la banque de questions');
  });

  it('distingue une session expirée d’un refus de règles', () => {
    const echec = echecDeLecture(erreurFirebase('unauthenticated'), 'le référentiel des formations');

    expect(echec.reessayable).toBe(false);
    expect(echec.texte).toContain('session a expiré');
  });

  it('laisse réessayer quand la base n’a pas répondu', () => {
    for (const code of ['unavailable', 'deadline-exceeded']) {
      const echec = echecDeLecture(erreurFirebase(code), 'la banque de questions');
      expect(echec.reessayable).toBe(true);
    }
  });

  it('reste réessayable devant une erreur qui ne vient pas du SDK', () => {
    const echec = echecDeLecture(new TypeError('fetch failed'), 'la banque de questions');

    expect(echec.reessayable).toBe(true);
    expect(echec.texte).toContain('la banque de questions');
  });

  it('ne se fie pas au message du SDK, seulement à son code', () => {
    const trompeur = new FirebaseError('unavailable', 'Missing or insufficient permissions.');

    expect(echecDeLecture(trompeur, 'la banque de questions').reessayable).toBe(true);
  });
});
