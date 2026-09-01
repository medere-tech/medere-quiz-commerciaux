import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest';

import { anonyme, connecte, creerEnvironnement, EXTERNE, JORDAN, NOEMIE, SOPHIE } from './aide';

let env: RulesTestEnvironment;

const SESSION = {
  code: 'JEUDI7',
  questionIds: ['q1', 'q2'],
  indexCourant: 0,
  revelee: false,
  statut: 'encours',
  animateurUid: NOEMIE.uid,
  creeeLe: new Date('2026-09-03T14:00:00Z'),
};

const AUTRE_ADMIN = { uid: 'uid-autre-admin', email: 'admin2@medere.fr', admin: true };

const reponseDe = (uid: string) => ({
  uid,
  questionId: 'q1',
  optionsChoisies: ['a'],
  correcte: true,
  repondueLe: new Date('2026-09-03T14:05:00Z'),
});

beforeAll(async () => {
  env = await creerEnvironnement();
});

afterEach(async () => {
  await env.clearFirestore();
});

afterAll(async () => {
  await env.cleanup();
});

async function semer(): Promise<void> {
  await env.withSecurityRulesDisabled(async (contexte) => {
    const base = contexte.firestore();
    await setDoc(doc(base, 'sessions/s1'), SESSION);
    await setDoc(doc(base, `sessions/s1/reponses/${SOPHIE.uid}_q1`), reponseDe(SOPHIE.uid));
  });
}

describe('Session collective', () => {
  it('tout commercial du domaine lit la session en cours', async () => {
    await semer();
    await assertSucceeds(getDoc(doc(connecte(env, JORDAN), 'sessions/s1')));
  });

  it('REFUS — un utilisateur hors domaine ne lit pas la session', async () => {
    await semer();
    await assertFails(getDoc(doc(connecte(env, EXTERNE), 'sessions/s1')));
  });

  it('REFUS — un visiteur non authentifié ne lit pas la session', async () => {
    await semer();
    await assertFails(getDoc(doc(anonyme(env), 'sessions/s1')));
  });

  it("l'animatrice crée une session et révèle la bonne réponse", async () => {
    const admin = connecte(env, NOEMIE);
    await assertSucceeds(setDoc(doc(admin, 'sessions/s2'), SESSION));
    await assertSucceeds(updateDoc(doc(admin, 'sessions/s2'), { revelee: true, indexCourant: 1 }));
  });

  it('REFUS — un commercial crée une session', async () => {
    await assertFails(setDoc(doc(connecte(env, JORDAN), 'sessions/s3'), SESSION));
  });

  it('REFUS — un commercial fait avancer la session', async () => {
    await semer();
    await assertFails(updateDoc(doc(connecte(env, JORDAN), 'sessions/s1'), { indexCourant: 1 }));
  });

  it('REFUS — un commercial révèle la bonne réponse', async () => {
    await semer();
    await assertFails(updateDoc(doc(connecte(env, JORDAN), 'sessions/s1'), { revelee: true }));
  });

  it("REFUS — un administrateur qui n'anime pas cette session la modifie ou la supprime", async () => {
    await semer();
    const autreAdmin = connecte(env, AUTRE_ADMIN);
    await assertFails(updateDoc(doc(autreAdmin, 'sessions/s1'), { revelee: true }));
    await assertFails(deleteDoc(doc(autreAdmin, 'sessions/s1')));
  });

  it("REFUS — un administrateur crée une session au nom d'un autre animateur", async () => {
    await assertFails(setDoc(doc(connecte(env, AUTRE_ADMIN), 'sessions/s4'), SESSION));
  });
});

describe('Réponses en session', () => {
  it('un participant enregistre sa propre réponse', async () => {
    await semer();
    await assertSucceeds(
      setDoc(
        doc(connecte(env, JORDAN), `sessions/s1/reponses/${JORDAN.uid}_q1`),
        reponseDe(JORDAN.uid),
      ),
    );
  });

  it('un participant relit sa propre réponse', async () => {
    await semer();
    await assertSucceeds(getDoc(doc(connecte(env, SOPHIE), `sessions/s1/reponses/${SOPHIE.uid}_q1`)));
  });

  it("l'animatrice lit toutes les réponses pour établir la répartition", async () => {
    await semer();
    await assertSucceeds(getDocs(collection(connecte(env, NOEMIE), 'sessions/s1/reponses')));
  });

  it("REFUS — un participant répond à la place d'un collègue", async () => {
    await semer();
    await assertFails(
      setDoc(
        doc(connecte(env, JORDAN), `sessions/s1/reponses/${SOPHIE.uid}_q1`),
        reponseDe(SOPHIE.uid),
      ),
    );
  });

  it("REFUS — un participant signe sa réponse avec l'identifiant d'un collègue", async () => {
    await semer();
    await assertFails(
      setDoc(
        doc(connecte(env, JORDAN), `sessions/s1/reponses/${JORDAN.uid}_q1`),
        reponseDe(SOPHIE.uid),
      ),
    );
  });

  it("REFUS — l'identifiant du document ne correspond pas à la question répondue", async () => {
    await semer();
    await assertFails(
      setDoc(
        doc(connecte(env, JORDAN), `sessions/s1/reponses/${JORDAN.uid}_q2`),
        reponseDe(JORDAN.uid),
      ),
    );
  });

  it('REFUS — un participant corrige sa réponse après coup', async () => {
    await semer();
    await assertFails(
      updateDoc(doc(connecte(env, SOPHIE), `sessions/s1/reponses/${SOPHIE.uid}_q1`), {
        optionsChoisies: ['b'],
      }),
    );
  });

  it("REFUS — un participant lit la réponse d'un collègue", async () => {
    await semer();
    await assertFails(getDoc(doc(connecte(env, JORDAN), `sessions/s1/reponses/${SOPHIE.uid}_q1`)));
  });

  it('REFUS — un participant liste les réponses de la session', async () => {
    await semer();
    await assertFails(getDocs(collection(connecte(env, JORDAN), 'sessions/s1/reponses')));
  });

  it('REFUS — un utilisateur hors domaine répond en session', async () => {
    await semer();
    await assertFails(
      setDoc(
        doc(connecte(env, EXTERNE), `sessions/s1/reponses/${EXTERNE.uid}_q1`),
        reponseDe(EXTERNE.uid),
      ),
    );
  });
});
