import { describe, expect, it } from 'vitest';

import { AVATARS, avatarOuDefaut, estCleAvatar, initiales } from '@/lib/session/avatar';

/**
 * Ce que ces tests protègent : ce qui s'affiche dans une pastille projetée.
 *
 * Une teinte inconnue donnerait un disque transparent devant une salle, et des
 * initiales à trois lettres ne se lisent plus à plusieurs mètres.
 */
describe('avatarOuDefaut', () => {
  it('accepte les huit teintes de la palette', () => {
    for (const cle of Object.keys(AVATARS)) {
      expect(estCleAvatar(cle)).toBe(true);
      expect(avatarOuDefaut(cle)).toBe(cle);
    }
  });

  it('retombe sur l’encre pour tout le reste', () => {
    expect(avatarOuDefaut('fuchsia')).toBe('encre');
    expect(avatarOuDefaut(undefined)).toBe('encre');
    expect(avatarOuDefaut(null)).toBe('encre');
    expect(avatarOuDefaut(42)).toBe('encre');
    // Un objet qui porterait une clé de `Object.prototype` ne passe pas.
    expect(avatarOuDefaut('toString')).toBe('encre');
  });
});

describe('initiales', () => {
  it('prend deux lettres, jamais trois', () => {
    expect(initiales('Marie-Charlotte de Villeneuve')).toBe('MC');
    expect(initiales('Jean Baptiste Lemaire')).toBe('JB');
  });

  it('double la première lettre d’un prénom seul', () => {
    expect(initiales('Yanis')).toBe('YA');
  });

  it('ne rend jamais rien', () => {
    expect(initiales('')).toBe('?');
    expect(initiales('   ')).toBe('?');
  });

  it('tient les noms composés et les espaces multiples', () => {
    expect(initiales('  léa   fournier ')).toBe('LF');
    expect(initiales('anne-sophie')).toBe('AS');
  });
});
