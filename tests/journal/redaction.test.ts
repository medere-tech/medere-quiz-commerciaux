import { describe, expect, it } from 'vitest';

import {
  cheminSeul,
  expurger,
  LIGNES_DE_PILE_MAX,
  MESSAGE_MAX,
  preparerPanne,
} from '../../src/lib/journal/redaction';

/**
 * Ce que ces tests protègent : le journal des pannes navigateur ne doit pas
 * devenir, par accident, le journal nominatif que tout le reste du projet
 * s'interdit.
 *
 * Un message d'erreur cite volontiers ce qui l'a provoqué : un chemin
 * Firestore qui porte un uid, une adresse professionnelle, un jeton. Personne
 * ne l'écrit exprès — c'est le SDK qui le compose. L'expurgation est donc la
 * seule barrière, et elle se vérifie.
 */

describe('expurger', () => {
  it('retire une adresse professionnelle', () => {
    expect(expurger('Refus pour jordan@medere.fr sur la lecture')).toBe(
      'Refus pour [adresse] sur la lecture',
    );
  });

  it('retire toutes les adresses, pas seulement la première', () => {
    expect(expurger('jordan@medere.fr et sophie@medere.fr')).toBe('[adresse] et [adresse]');
  });

  it('retire l’identifiant d’un chemin utilisateur et garde le reste', () => {
    // La question reste lisible — c'est elle qui aide à reproduire —, la
    // personne disparaît.
    expect(expurger('PERMISSION_DENIED: users/uid-jordan-123/reponses/q-vf_1789')).toBe(
      'PERMISSION_DENIED: users/[uid]/reponses/q-vf_1789',
    );
  });

  it('ne touche pas aux chemins qui ne portent personne', () => {
    expect(expurger('Lecture refusée sur sessions/s1/reponses')).toBe(
      'Lecture refusée sur sessions/s1/reponses',
    );
  });

  it('retire un jeton laissé dans un message', () => {
    expect(
      expurger('Authorization: eyJhbGciOiJSUzI1.eyJzdWIiOiJ1aWQi.c2lnbmF0dXJlX2ljaQ fin'),
    ).toBe('Authorization: [jeton] fin');
  });

  it('laisse intact un message qui ne porte rien de personnel', () => {
    const message = 'Cannot read properties of undefined (reading « ordreOptions »)';
    expect(expurger(message)).toBe(message);
  });
});

describe('cheminSeul', () => {
  it('retire la chaîne de requête', () => {
    // Rien ne garantit ce qu'un lien futur y mettra, et la règle du projet est
    // qu'aucune donnée personnelle ne passe par une chaîne de requête.
    expect(cheminSeul('/admin/questions/abc?retour=/session&code=JEUDI7')).toBe(
      '/admin/questions/abc',
    );
  });

  it('retire l’ancre', () => {
    expect(cheminSeul('/a-revoir#question-3')).toBe('/a-revoir');
  });

  it('garde un chemin nu', () => {
    expect(cheminSeul('/session')).toBe('/session');
  });
});

describe('preparerPanne', () => {
  const panne = {
    origine: 'globale',
    message: 'Échec de lecture pour jordan@medere.fr',
    pile: 'Error: x\n  at a\n  at b\n  at c\n  at d\n  at e\n  at f\n  at g',
    chemin: '/serie?serie=3',
    digest: '1423820907',
  };

  it('expurge, borne et met en forme', () => {
    const prete = preparerPanne(panne);

    expect(prete).toEqual({
      origine: 'globale',
      message: 'Échec de lecture pour [adresse]',
      pile: 'Error: x | at a | at b | at c | at d | at e',
      chemin: '/serie',
      digest: '1423820907',
    });
  });

  it('ne garde que six lignes de pile', () => {
    const prete = preparerPanne(panne);
    expect(prete?.pile.split(' | ')).toHaveLength(LIGNES_DE_PILE_MAX);
  });

  it('borne un message trop long', () => {
    const prete = preparerPanne({ ...panne, message: 'a'.repeat(1000) });
    expect(prete?.message).toHaveLength(MESSAGE_MAX);
  });

  it('refuse une origine inventée', () => {
    // Le champ vient du navigateur : il est validé contre une liste fermée,
    // pas recopié.
    expect(preparerPanne({ ...panne, origine: 'exfiltration' })).toBeNull();
  });

  it('refuse un signalement sans message', () => {
    // Un signalement vide encombrerait le journal qu'on essaie de garder
    // lisible.
    expect(preparerPanne({ ...panne, message: '   ' })).toBeNull();
  });

  it('nettoie un digest fantaisiste au lieu de le recopier', () => {
    const prete = preparerPanne({ ...panne, digest: '<script>alert(1)</script>' });
    expect(prete?.digest).toBe('scriptalert1script');
  });

  it('tolère une panne sans pile ni digest', () => {
    const prete = preparerPanne({ origine: 'promesse', message: 'Échec', chemin: '/' });

    expect(prete).toEqual({
      origine: 'promesse',
      message: 'Échec',
      pile: '',
      chemin: '/',
      digest: '',
    });
  });
});
