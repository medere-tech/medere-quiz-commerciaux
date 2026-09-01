import { describe, expect, it } from 'vitest';

import { DOMAINE_DES_REGLES, estDuDomaine } from '@/lib/auth/domaine';
import { ErreurConfiguration, exigerVariables, listeDAdresses } from '@/lib/env/validation';

describe("Validation des variables d'environnement", () => {
  it('laisse passer une configuration complète', () => {
    const variables = exigerVariables('test', { UNE_VARIABLE: 'valeur' });
    expect(variables.UNE_VARIABLE).toBe('valeur');
  });

  it('échoue et nomme les variables absentes ou vides', () => {
    expect(() =>
      exigerVariables('serveur', {
        PRESENTE: 'valeur',
        ABSENTE: undefined,
        VIDE: '   ',
      }),
    ).toThrowError(ErreurConfiguration);

    try {
      exigerVariables('serveur', { PRESENTE: 'valeur', ABSENTE: undefined, VIDE: '' });
      expect.unreachable("la validation aurait dû échouer");
    } catch (erreur) {
      const message = (erreur as Error).message;
      expect(message).toContain('ABSENTE');
      expect(message).toContain('VIDE');
      expect(message).not.toContain('PRESENTE');
      expect(message).toContain('.env.local');
    }
  });

  it('découpe et normalise la liste des administrateurs', () => {
    expect(listeDAdresses(' Noemie@Medere.fr , dethie@medere.fr ,, ')).toEqual([
      'noemie@medere.fr',
      'dethie@medere.fr',
    ]);
  });
});

describe('Restriction de domaine', () => {
  it('accepte une adresse du domaine, quelle que soit la casse', () => {
    expect(estDuDomaine('Jordan@Medere.fr', DOMAINE_DES_REGLES)).toBe(true);
  });

  it('refuse une adresse extérieure', () => {
    expect(estDuDomaine('visiteur@gmail.com', DOMAINE_DES_REGLES)).toBe(false);
  });

  it('refuse un domaine qui imite le domaine autorisé', () => {
    expect(estDuDomaine('pirate@medere.fr.exemple.com', DOMAINE_DES_REGLES)).toBe(false);
    expect(estDuDomaine('pirate@notmedere.fr', DOMAINE_DES_REGLES)).toBe(false);
    expect(estDuDomaine('pirate@medere.fr@gmail.com', DOMAINE_DES_REGLES)).toBe(false);
  });

  it("refuse une adresse absente ou malformée", () => {
    expect(estDuDomaine(undefined, DOMAINE_DES_REGLES)).toBe(false);
    expect(estDuDomaine('', DOMAINE_DES_REGLES)).toBe(false);
    expect(estDuDomaine('@medere.fr', DOMAINE_DES_REGLES)).toBe(false);
  });
});
