import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { PLAFONDS, brouillonVierge, type BrouillonQuestion } from '@/lib/questions/modele';
import { messagePour, validerQuestion } from '@/lib/questions/validation';

import { connecte, creerEnvironnement, HIER, NOEMIE } from '../regles/aide';

function brouillon(remplacements: Partial<BrouillonQuestion> = {}): BrouillonQuestion {
  return {
    ...brouillonVierge(),
    enonce: 'Le DPC est obligatoire pour les chirurgiens-dentistes.',
    bonnesReponses: ['vrai'],
    explication: "L'obligation est triennale.",
    formationIds: ['rec1234567890abcd'],
    theme: 'reglementaire',
    ...remplacements,
  };
}

function erreurs(remplacements: Partial<BrouillonQuestion> = {}) {
  const resultat = validerQuestion(brouillon(remplacements));
  return resultat.valide ? [] : resultat.erreurs;
}

describe('Validation — un brouillon conforme', () => {
  it('accepte une question vrai/faux complète', () => {
    const resultat = validerQuestion(brouillon());
    expect(resultat.valide).toBe(true);
  });

  it('coupe les espaces et supprime le contexte hors mise en situation', () => {
    const resultat = validerQuestion(brouillon({ enonce: '  Un énoncé.  ', contexte: 'Ignoré' }));

    expect(resultat.valide).toBe(true);
    if (!resultat.valide) return;
    expect(resultat.question.enonce).toBe('Un énoncé.');
    expect(resultat.question.contexte).toBeNull();
  });

  it('conserve le contexte d’une mise en situation', () => {
    const resultat = validerQuestion(
      brouillon({ type: 'scenario', contexte: 'Un dentiste vient de terminer Parodontie.' }),
    );

    expect(resultat.valide).toBe(true);
    if (!resultat.valide) return;
    expect(resultat.question.contexte).toBe('Un dentiste vient de terminer Parodontie.');
  });

  it('n’écrit pas les champs de source laissés vides', () => {
    const resultat = validerQuestion(brouillon());
    expect(resultat.valide).toBe(true);
    if (!resultat.valide) return;
    expect('sourceFiche' in resultat.question).toBe(false);
    expect('sourceVersion' in resultat.question).toBe(false);
  });

  it('conserve les champs de source renseignés', () => {
    const resultat = validerQuestion(
      brouillon({ sourceFiche: 'Argumentaire Parodontie', sourceVersion: 'v3' }),
    );
    expect(resultat.valide).toBe(true);
    if (!resultat.valide) return;
    expect(resultat.question.sourceFiche).toBe('Argumentaire Parodontie');
  });
});

describe("Validation — l'explication, exigence première", () => {
  it('refuse une explication absente, et dit pourquoi', () => {
    const message = messagePour(erreurs({ explication: '' }), 'explication');
    expect(message).toContain('obligatoire');
    // Le message dit à quoi sert le champ, pas seulement qu'il manque.
    expect(message).toContain('après chaque réponse');
  });

  it('refuse une explication faite d’espaces', () => {
    expect(messagePour(erreurs({ explication: '   ' }), 'explication')).toBeDefined();
  });

  it('refuse une explication trop longue, en donnant la longueur et le maximum', () => {
    const message = messagePour(erreurs({ explication: 'a'.repeat(1001) }), 'explication');
    expect(message).toContain('1001');
    expect(message).toContain(String(PLAFONDS.explication));
  });

  it('accepte une explication à la limite exacte', () => {
    expect(erreurs({ explication: 'a'.repeat(PLAFONDS.explication) })).toEqual([]);
  });
});

describe('Validation — les autres champs', () => {
  it('refuse un énoncé vide', () => {
    expect(messagePour(erreurs({ enonce: '' }), 'enonce')).toContain('obligatoire');
  });

  it('refuse un thème vide', () => {
    expect(messagePour(erreurs({ theme: '' }), 'theme')).toContain('obligatoire');
  });

  it('refuse une mise en situation sans contexte', () => {
    const message = messagePour(erreurs({ type: 'scenario', contexte: '' }), 'contexte');
    expect(message).toContain('contexte');
  });

  it('accepte une question vrai/faux sans contexte', () => {
    expect(erreurs({ type: 'vf', contexte: '' })).toEqual([]);
  });

  it('refuse une question sans formation rattachée', () => {
    const message = messagePour(erreurs({ formationIds: [] }), 'formationIds');
    expect(message).toContain('au moins une formation');
  });

  it('dédoublonne les formations rattachées', () => {
    const resultat = validerQuestion(brouillon({ formationIds: ['recA', 'recA', 'recB'] }));
    expect(resultat.valide).toBe(true);
    if (!resultat.valide) return;
    expect(resultat.question.formationIds).toEqual(['recA', 'recB']);
  });

  it('refuse une question sans bonne réponse', () => {
    expect(messagePour(erreurs({ bonnesReponses: [] }), 'bonnesReponses')).toContain(
      'au moins une bonne réponse',
    );
  });

  it('refuse une bonne réponse qui ne désigne aucune option', () => {
    expect(messagePour(erreurs({ bonnesReponses: ['inconnue'] }), 'bonnesReponses')).toBeDefined();
  });

  it('refuse une seule option', () => {
    const message = messagePour(
      erreurs({ options: { vrai: 'Vrai' }, ordreOptions: ['vrai'], bonnesReponses: ['vrai'] }),
      'options',
    );
    expect(message).toContain('au moins 2 options');
  });

  it('refuse un libellé d’option vide — ce que les règles ne savent pas voir', () => {
    const message = messagePour(
      erreurs({ options: { vrai: 'Vrai', faux: '   ' } }),
      'options',
    );
    expect(message).toContain('libellé');
  });

  it('refuse un libellé d’option trop long', () => {
    expect(
      messagePour(
        erreurs({ options: { vrai: 'a'.repeat(PLAFONDS.optionTexte + 1), faux: 'Faux' } }),
        'options',
      ),
    ).toBeDefined();
  });

  it('refuse un ordre d’affichage qui ne correspond plus aux options', () => {
    expect(messagePour(erreurs({ ordreOptions: ['vrai'] }), 'ordreOptions')).toBeDefined();
  });

  it('refuse une difficulté hors échelle', () => {
    expect(
      messagePour(erreurs({ difficulte: 4 as BrouillonQuestion['difficulte'] }), 'difficulte'),
    ).toBeDefined();
  });

  it('signale tous les champs en défaut, pas seulement le premier', () => {
    const liste = erreurs({ enonce: '', explication: '', theme: '', formationIds: [] });
    expect(liste.map((erreur) => erreur.champ).sort()).toEqual([
      'enonce',
      'explication',
      'formationIds',
      'theme',
    ]);
  });
});

describe('Accord entre la validation de l’éditeur et les règles Firestore', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    env = await creerEnvironnement();
  });

  afterEach(async () => {
    await env.clearFirestore();
  });

  afterAll(async () => {
    await env.cleanup();
  });

  function aEcrire(resultat: ReturnType<typeof validerQuestion>) {
    if (!resultat.valide) throw new Error('brouillon invalide');
    return {
      ...resultat.question,
      creeeLe: HIER,
      modifieeLe: HIER,
      creeePar: NOEMIE.uid,
    } as Record<string, unknown>;
  }

  it('ce que la validation accepte, les règles l’acceptent', async () => {
    const resultat = validerQuestion(brouillon());
    await assertSucceeds(
      setDoc(doc(connecte(env, NOEMIE), 'questions/accord-1'), aEcrire(resultat)),
    );
  });

  it('une mise en situation validée passe aussi les règles', async () => {
    const resultat = validerQuestion(
      brouillon({ type: 'scenario', contexte: 'Une scène de vente.' }),
    );
    await assertSucceeds(
      setDoc(doc(connecte(env, NOEMIE), 'questions/accord-2'), aEcrire(resultat)),
    );
  });

  it('une question aux champs de source renseignés passe aussi les règles', async () => {
    const resultat = validerQuestion(brouillon({ sourceFiche: 'Fiche', sourceVersion: 'v2' }));
    await assertSucceeds(
      setDoc(doc(connecte(env, NOEMIE), 'questions/accord-3'), aEcrire(resultat)),
    );
  });

  it('sans explication, les règles refusent aussi — le message précède le refus', async () => {
    const brouillonSansExplication = brouillon({ explication: '' });
    expect(validerQuestion(brouillonSansExplication).valide).toBe(false);

    // Le même document, forcé sans passer par la validation.
    await assertFails(
      setDoc(doc(connecte(env, NOEMIE), 'questions/accord-4'), {
        type: brouillonSansExplication.type,
        contexte: null,
        enonce: brouillonSansExplication.enonce,
        options: brouillonSansExplication.options,
        ordreOptions: brouillonSansExplication.ordreOptions,
        bonnesReponses: brouillonSansExplication.bonnesReponses,
        explication: '',
        formationIds: brouillonSansExplication.formationIds,
        theme: brouillonSansExplication.theme,
        difficulte: brouillonSansExplication.difficulte,
        statut: brouillonSansExplication.statut,
        creeeLe: HIER,
        modifieeLe: HIER,
        creeePar: NOEMIE.uid,
      }),
    );
  });
});
