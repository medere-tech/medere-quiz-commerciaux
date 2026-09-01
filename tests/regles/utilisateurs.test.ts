import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest';

import { connecte, creerEnvironnement, JORDAN, NOEMIE, SOPHIE } from './aide';

let env: RulesTestEnvironment;

const REPONSE = {
  questionId: 'q1',
  correcte: false,
  optionsChoisies: ['b'],
  origine: 'entrainement',
  repondueLe: new Date('2026-09-01T10:00:00Z'),
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

/** Documents posés par le serveur, comme le fait le SDK Admin à la connexion. */
async function semer(): Promise<void> {
  await env.withSecurityRulesDisabled(async (contexte) => {
    const base = contexte.firestore();
    for (const compte of [JORDAN, SOPHIE]) {
      await setDoc(doc(base, `users/${compte.uid}`), {
        email: compte.email,
        nom: compte.email,
        photoURL: '',
        role: 'commercial',
        etoiles: 4,
        seriesTerminees: 2,
        creeLe: new Date('2026-08-01T09:00:00Z'),
        vuLe: new Date('2026-08-01T09:00:00Z'),
      });
    }
    await setDoc(doc(base, `users/${SOPHIE.uid}/reponses/r1`), REPONSE);
    await setDoc(doc(base, `users/${JORDAN.uid}/reponses/r1`), REPONSE);
  });
}

describe('Document utilisateur', () => {
  it('le propriétaire lit son propre document', async () => {
    await semer();
    await assertSucceeds(getDoc(doc(connecte(env, JORDAN), `users/${JORDAN.uid}`)));
  });

  it('le propriétaire met à jour sa progression', async () => {
    await semer();
    await assertSucceeds(
      updateDoc(doc(connecte(env, JORDAN), `users/${JORDAN.uid}`), {
        etoiles: 7,
        seriesTerminees: 3,
        vuLe: new Date('2026-09-01T10:00:00Z'),
      }),
    );
  });

  it("REFUS — un utilisateur s'attribue le rôle administrateur dans son propre document", async () => {
    await semer();
    await assertFails(
      updateDoc(doc(connecte(env, JORDAN), `users/${JORDAN.uid}`), { role: 'admin' }),
    );
  });

  it("REFUS — un utilisateur ajoute un champ isAdmin à son propre document", async () => {
    await semer();
    await assertFails(
      updateDoc(doc(connecte(env, JORDAN), `users/${JORDAN.uid}`), { isAdmin: true }),
    );
  });

  it('REFUS — un utilisateur change son adresse e-mail', async () => {
    await semer();
    await assertFails(
      updateDoc(doc(connecte(env, JORDAN), `users/${JORDAN.uid}`), { email: 'jordan@gmail.com' }),
    );
  });

  it('REFUS — un utilisateur crée lui-même son document (réservé au serveur)', async () => {
    await assertFails(
      setDoc(doc(connecte(env, JORDAN), `users/${JORDAN.uid}`), {
        email: JORDAN.email,
        role: 'admin',
        etoiles: 0,
        seriesTerminees: 0,
      }),
    );
  });

  it('REFUS — un utilisateur supprime son document', async () => {
    await semer();
    await assertFails(deleteDoc(doc(connecte(env, JORDAN), `users/${JORDAN.uid}`)));
  });

  it("REFUS — un utilisateur lit le document d'un collègue", async () => {
    await semer();
    await assertFails(getDoc(doc(connecte(env, JORDAN), `users/${SOPHIE.uid}`)));
  });

  it("REFUS — un administrateur lit le document d'un commercial", async () => {
    await semer();
    await assertFails(getDoc(doc(connecte(env, NOEMIE), `users/${JORDAN.uid}`)));
  });

  it('REFUS — un utilisateur liste la collection des utilisateurs', async () => {
    await semer();
    await assertFails(getDocs(collection(connecte(env, JORDAN), 'users')));
  });
});

describe('Réponses individuelles — isolation des scores', () => {
  it('le propriétaire enregistre et relit ses réponses', async () => {
    await semer();
    const base = connecte(env, JORDAN);
    await assertSucceeds(setDoc(doc(base, `users/${JORDAN.uid}/reponses/r2`), REPONSE));
    await assertSucceeds(getDocs(collection(base, `users/${JORDAN.uid}/reponses`)));
  });

  it("REFUS — un utilisateur lit les réponses d'un collègue", async () => {
    await semer();
    await assertFails(getDoc(doc(connecte(env, JORDAN), `users/${SOPHIE.uid}/reponses/r1`)));
  });

  it("REFUS — un utilisateur liste les réponses d'un collègue", async () => {
    await semer();
    await assertFails(getDocs(collection(connecte(env, JORDAN), `users/${SOPHIE.uid}/reponses`)));
  });

  it("REFUS — un administrateur lit les réponses d'un commercial", async () => {
    await semer();
    await assertFails(getDoc(doc(connecte(env, NOEMIE), `users/${JORDAN.uid}/reponses/r1`)));
  });

  it("REFUS — un utilisateur écrit une réponse dans le compte d'un collègue", async () => {
    await semer();
    await assertFails(setDoc(doc(connecte(env, JORDAN), `users/${SOPHIE.uid}/reponses/r9`), REPONSE));
  });

  it('REFUS — une réponse déjà enregistrée ne peut être réécrite ni supprimée', async () => {
    await semer();
    const base = connecte(env, JORDAN);
    await assertFails(updateDoc(doc(base, `users/${JORDAN.uid}/reponses/r1`), { correcte: true }));
    await assertFails(deleteDoc(doc(base, `users/${JORDAN.uid}/reponses/r1`)));
  });

  it("REFUS — une requête de groupe de collections contourne l'isolation", async () => {
    await semer();
    await assertFails(getDocs(collectionGroup(connecte(env, NOEMIE), 'reponses')));
    await assertFails(getDocs(collectionGroup(connecte(env, JORDAN), 'reponses')));
  });
});
