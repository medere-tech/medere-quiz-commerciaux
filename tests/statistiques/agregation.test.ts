import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { agreger, lireReponse } from '../../functions/src/agregation';

/**
 * Ce que ces tests protègent : l'anonymat de `questionStats` et l'exactitude
 * de ses compteurs.
 *
 * L'anonymat n'est pas une intention, c'est une propriété vérifiable — on
 * relit l'agrégat écrit et on exige qu'il ne porte que trois champs. Si
 * quelqu'un ajoute un jour un `uid` « juste pour déboguer », un test tombe.
 */

let app: App;
let base: Firestore;

const CHAMPS_ATTENDUS = ['tentatives', 'echecs', 'majLe'];

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      'Ces tests exigent l’émulateur Firestore. Lancez-les par `npm test`, ' +
        'qui passe par `firebase emulators:exec`.',
    );
  }

  // Contre l'émulateur, aucune identification n'est requise ni souhaitable :
  // le SDK Admin y écrit hors règles, exactement comme la Cloud Function.
  app = initializeApp({ projectId: 'demo-medere-quiz' }, 'agregation');
  base = getFirestore(app);
});

afterEach(async () => {
  const agregats = await base.collection('questionStats').listDocuments();
  for (const agregat of agregats) {
    const marqueurs = await agregat.collection('evenements').listDocuments();
    await Promise.all(marqueurs.map((marqueur) => marqueur.delete()));
    await agregat.delete();
  }
});

afterAll(async () => {
  if (app) await deleteApp(app);
});

async function lireAgregat(questionId: string): Promise<Record<string, unknown> | undefined> {
  return (await base.collection('questionStats').doc(questionId).get()).data();
}

describe('lireReponse', () => {
  it('extrait la question et le verdict, et rien d’autre', () => {
    expect(
      lireReponse({
        questionId: 'q1',
        correcte: false,
        optionsChoisies: ['a'],
        origine: 'entrainement',
        repondueLe: new Date(),
      }),
    ).toEqual({ questionId: 'q1', correcte: false });
  });

  it('refuse une réponse sans identifiant de question exploitable', () => {
    expect(lireReponse({ correcte: true })).toBeNull();
    expect(lireReponse({ questionId: '', correcte: true })).toBeNull();
    expect(lireReponse({ questionId: '   ', correcte: true })).toBeNull();
    expect(lireReponse({ questionId: 42, correcte: true })).toBeNull();
  });

  it('refuse un verdict qui n’est pas un booléen', () => {
    // Un verdict absent compterait comme un échec par simple falsy : la
    // statistique mentirait sans que rien ne le signale.
    expect(lireReponse({ questionId: 'q1' })).toBeNull();
    expect(lireReponse({ questionId: 'q1', correcte: 'faux' })).toBeNull();
    expect(lireReponse({ questionId: 'q1', correcte: 0 })).toBeNull();
  });

  it('refuse ce qui n’est pas un document', () => {
    expect(lireReponse(null)).toBeNull();
    expect(lireReponse(undefined)).toBeNull();
    expect(lireReponse('q1')).toBeNull();
  });
});

describe('agreger', () => {
  it('crée l’agrégat à la première réponse', async () => {
    await agreger(base, { questionId: 'q1', correcte: false, evenementId: 'e1' });

    const stats = await lireAgregat('q1');
    expect(stats?.tentatives).toBe(1);
    expect(stats?.echecs).toBe(1);
  });

  it('ne compte pas d’échec sur une bonne réponse', async () => {
    await agreger(base, { questionId: 'q1', correcte: true, evenementId: 'e1' });

    const stats = await lireAgregat('q1');
    expect(stats?.tentatives).toBe(1);
    expect(stats?.echecs).toBe(0);
  });

  it('cumule les réponses successives', async () => {
    await agreger(base, { questionId: 'q1', correcte: false, evenementId: 'e1' });
    await agreger(base, { questionId: 'q1', correcte: true, evenementId: 'e2' });
    await agreger(base, { questionId: 'q1', correcte: false, evenementId: 'e3' });

    const stats = await lireAgregat('q1');
    expect(stats?.tentatives).toBe(3);
    expect(stats?.echecs).toBe(2);
  });

  it('n’écrit aucun identifiant d’utilisateur dans l’agrégat', async () => {
    await agreger(base, { questionId: 'q1', correcte: false, evenementId: 'e1' });

    const stats = (await lireAgregat('q1')) ?? {};
    expect(Object.keys(stats).sort()).toEqual([...CHAMPS_ATTENDUS].sort());
  });

  it('ne compte pas deux fois le même événement', async () => {
    // Cloud Functions livre au moins une fois : le même événement peut
    // arriver deux fois, et un compteur qui dérive discrédite tout l'écran.
    expect(await agreger(base, { questionId: 'q1', correcte: false, evenementId: 'e1' })).toBe(
      'agrege',
    );
    expect(await agreger(base, { questionId: 'q1', correcte: false, evenementId: 'e1' })).toBe(
      'doublon',
    );

    const stats = await lireAgregat('q1');
    expect(stats?.tentatives).toBe(1);
    expect(stats?.echecs).toBe(1);
  });

  it('sépare les agrégats par question', async () => {
    await agreger(base, { questionId: 'q1', correcte: false, evenementId: 'e1' });
    await agreger(base, { questionId: 'q2', correcte: false, evenementId: 'e2' });
    await agreger(base, { questionId: 'q2', correcte: false, evenementId: 'e3' });

    expect((await lireAgregat('q1'))?.tentatives).toBe(1);
    expect((await lireAgregat('q2'))?.tentatives).toBe(2);
  });

  it('date la dernière mise à jour', async () => {
    await agreger(base, { questionId: 'q1', correcte: true, evenementId: 'e1' });

    const stats = await lireAgregat('q1');
    expect(stats?.majLe).toBeDefined();
  });

  it('pose un marqueur daté, pour que la purge puisse le reprendre', async () => {
    await agreger(base, { questionId: 'q1', correcte: true, evenementId: 'e1' });

    const marqueur = await base.doc('questionStats/q1/evenements/e1').get();
    expect(marqueur.exists).toBe(true);
    expect(marqueur.data()?.expireLe.toDate().getTime()).toBeGreaterThan(Date.now());
  });
});
