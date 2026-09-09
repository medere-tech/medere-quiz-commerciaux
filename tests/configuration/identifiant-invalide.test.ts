import { describe, expect, it } from 'vitest';

import { estIdentifiantSansValeur } from '@/lib/auth/identifiant-invalide';

/**
 * Ce que ce test protège : la frontière entre « cette session ne vaut rien »
 * et « le serveur est cassé ».
 *
 * Les confondre produit le pire des écrans : une invitation à se reconnecter
 * devant une panne, sans rien dans les journaux. C'est ce qui a masqué le
 * module introuvable de Vercel pendant deux déploiements.
 */

function erreur(code: string): Error & { code: string } {
  return Object.assign(new Error('message du SDK, en anglais et instable'), { code });
}

describe('estIdentifiantSansValeur', () => {
  it('reconnaît un cookie de session sans valeur', () => {
    for (const code of [
      'auth/session-cookie-expired',
      'auth/session-cookie-revoked',
      'auth/invalid-session-cookie',
    ]) {
      expect(estIdentifiantSansValeur(erreur(code))).toBe(true);
    }
  });

  it('reconnaît un jeton d’identité sans valeur', () => {
    for (const code of ['auth/id-token-expired', 'auth/id-token-revoked', 'auth/invalid-id-token']) {
      expect(estIdentifiantSansValeur(erreur(code))).toBe(true);
    }
  });

  it('reconnaît un compte qui n’a plus le droit d’entrer', () => {
    expect(estIdentifiantSansValeur(erreur('auth/user-disabled'))).toBe(true);
    expect(estIdentifiantSansValeur(erreur('auth/user-not-found'))).toBe(true);
    expect(estIdentifiantSansValeur(erreur('auth/argument-error'))).toBe(true);
  });

  it('REFUSE de traiter une panne du service comme une session absente', () => {
    // `internal-error` et `invalid-credential` désignent le service ou notre
    // configuration, jamais l'utilisateur. Les avaler afficherait un écran de
    // connexion parfaitement trompeur.
    expect(estIdentifiantSansValeur(erreur('auth/internal-error'))).toBe(false);
    expect(estIdentifiantSansValeur(erreur('auth/invalid-credential'))).toBe(false);
  });

  it('REFUSE de traiter une panne de chargement comme une session absente', () => {
    // Le cas exact du 500 de Vercel : un module introuvable remontait ici.
    expect(estIdentifiantSansValeur(erreur('ERR_REQUIRE_ESM'))).toBe(false);
    expect(estIdentifiantSansValeur(erreur('MODULE_NOT_FOUND'))).toBe(false);
    expect(estIdentifiantSansValeur(new TypeError('fetch failed'))).toBe(false);
  });

  it('ne se laisse pas abuser par une erreur sans code', () => {
    expect(estIdentifiantSansValeur(new Error('rien'))).toBe(false);
    expect(estIdentifiantSansValeur(null)).toBe(false);
    expect(estIdentifiantSansValeur(undefined)).toBe(false);
    expect(estIdentifiantSansValeur('auth/session-cookie-expired')).toBe(false);
  });
});
