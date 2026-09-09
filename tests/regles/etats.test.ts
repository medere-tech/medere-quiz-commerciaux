import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest';

import { anonyme, connecte, creerEnvironnement, EXTERNE, JORDAN, NOEMIE } from './aide';

/**
 * États par question : `users/{uid}/etats/{questionId}`.
 *
 * Ce que ces tests protègent, dans l'ordre d'importance :
 *
 * 1. **L'isolation.** Personne ne lit l'état d'un autre, administrateur
 *    compris. C'est la même règle que pour les réponses, et pour la même
 *    raison : Noémie ne doit pas pouvoir savoir qui rate quoi.
 * 2. **La monotonie des compteurs.** Une écriture close au plus une
 *    tentative. Sans cela, un client modifié s'attribuerait mille réussites
 *    et sortirait toutes ses questions du tirage.
 * 3. **La forme exacte.** Ni champ libre ajouté, ni champ manquant.
 */

let env: RulesTestEnvironment;

const ETAT = {
  reussies: 1,
  tentatives: 2,
  derniereRatee: true,
  majLe: new Date('2026-09-08T08:00:00Z'),
};

beforeAll(async () => {
  env = await creerEnvironnement();
});

afterEach(async () => {
  await env.clearFirestore();
});

afterAll(async () => {
  await env.cleanup();
});

function chemin(uid: string, questionId = 'q1'): string {
  return `users/${uid}/etats/${questionId}`;
}

async function semer(uid: string, etat: Record<string, unknown> = ETAT): Promise<void> {
  await env.withSecurityRulesDisabled(async (contexte) => {
    await setDoc(doc(contexte.firestore(), chemin(uid)), etat);
  });
}

const NEUF = { reussies: 1, tentatives: 1, derniereRatee: false, majLe: new Date('2026-09-08T08:00:00Z') };

describe('Isolation des états', () => {
  it('le propriétaire lit son propre état', async () => {
    await semer(JORDAN.uid);
    await assertSucceeds(getDoc(doc(connecte(env, JORDAN), chemin(JORDAN.uid))));
  });

  it('REFUS — l’administrateur ne lit pas l’état d’un commercial', async () => {
    await semer(JORDAN.uid);
    await assertFails(getDoc(doc(connecte(env, NOEMIE), chemin(JORDAN.uid))));
  });

  it('REFUS — un commercial ne lit pas l’état d’un autre', async () => {
    await semer(NOEMIE.uid);
    await assertFails(getDoc(doc(connecte(env, JORDAN), chemin(NOEMIE.uid))));
  });

  it('REFUS — un visiteur non authentifié ne lit rien', async () => {
    await semer(JORDAN.uid);
    await assertFails(getDoc(doc(anonyme(env), chemin(JORDAN.uid))));
  });

  it('REFUS — un utilisateur hors domaine ne lit rien', async () => {
    await semer(EXTERNE.uid);
    await assertFails(getDoc(doc(connecte(env, EXTERNE), chemin(EXTERNE.uid))));
  });

  it('REFUS — écrire l’état d’un autre', async () => {
    await assertFails(setDoc(doc(connecte(env, JORDAN), chemin(NOEMIE.uid)), NEUF));
  });
});

describe('Création d’un état', () => {
  it('accepte une première tentative', async () => {
    await assertSucceeds(setDoc(doc(connecte(env, JORDAN), chemin(JORDAN.uid)), NEUF));
  });

  it('REFUS — une création qui annonce plusieurs tentatives', async () => {
    // Créer directement un état à cinquante tentatives contournerait la
    // monotonie que les mises à jour font respecter.
    await assertFails(
      setDoc(doc(connecte(env, JORDAN), chemin(JORDAN.uid)), { ...NEUF, tentatives: 50, reussies: 50 }),
    );
  });

  it('REFUS — plus de réussites que de tentatives', async () => {
    await assertFails(
      setDoc(doc(connecte(env, JORDAN), chemin(JORDAN.uid)), { ...NEUF, reussies: 2, tentatives: 1 }),
    );
  });

  it('REFUS — un champ libre en plus', async () => {
    await assertFails(
      setDoc(doc(connecte(env, JORDAN), chemin(JORDAN.uid)), { ...NEUF, triche: true }),
    );
  });

  it('REFUS — un champ manquant', async () => {
    const { derniereRatee, ...sansVerdict } = NEUF;
    void derniereRatee;
    await assertFails(setDoc(doc(connecte(env, JORDAN), chemin(JORDAN.uid)), sansVerdict));
  });

  it('REFUS — un horodatage dans le futur', async () => {
    await assertFails(
      setDoc(doc(connecte(env, JORDAN), chemin(JORDAN.uid)), {
        ...NEUF,
        majLe: new Date(Date.now() + 60 * 60 * 1000),
      }),
    );
  });

  it('REFUS — un compteur qui n’est pas un entier', async () => {
    await assertFails(
      setDoc(doc(connecte(env, JORDAN), chemin(JORDAN.uid)), { ...NEUF, tentatives: 1.5 }),
    );
  });
});

describe('Mise à jour d’un état', () => {
  it('accepte une tentative de plus', async () => {
    await semer(JORDAN.uid);
    await assertSucceeds(
      updateDoc(doc(connecte(env, JORDAN), chemin(JORDAN.uid)), {
        tentatives: 3,
        reussies: 2,
        derniereRatee: false,
        majLe: new Date('2026-09-08T09:00:00Z'),
      }),
    );
  });

  it('REFUS — deux tentatives d’un coup', async () => {
    await semer(JORDAN.uid);
    await assertFails(
      updateDoc(doc(connecte(env, JORDAN), chemin(JORDAN.uid)), {
        tentatives: 4,
        reussies: 1,
        derniereRatee: true,
        majLe: new Date('2026-09-08T09:00:00Z'),
      }),
    );
  });

  it('REFUS — deux réussites pour une tentative', async () => {
    await semer(JORDAN.uid);
    await assertFails(
      updateDoc(doc(connecte(env, JORDAN), chemin(JORDAN.uid)), {
        tentatives: 3,
        reussies: 3,
        derniereRatee: false,
        majLe: new Date('2026-09-08T09:00:00Z'),
      }),
    );
  });

  it('REFUS — un compteur qui redescend', async () => {
    await semer(JORDAN.uid);
    await assertFails(
      updateDoc(doc(connecte(env, JORDAN), chemin(JORDAN.uid)), {
        tentatives: 1,
        reussies: 0,
        derniereRatee: false,
        majLe: new Date('2026-09-08T09:00:00Z'),
      }),
    );
  });

  it('REFUS — supprimer un état', async () => {
    await semer(JORDAN.uid);
    await assertFails(deleteDoc(doc(connecte(env, JORDAN), chemin(JORDAN.uid))));
  });
});
