import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest';

import { anonyme, connecte, creerEnvironnement, EXTERNE, JORDAN, NOEMIE } from './aide';

let env: RulesTestEnvironment;

const QUESTION = {
  type: 'vf',
  contexte: null,
  enonce: 'Le DPC est obligatoire pour les chirurgiens-dentistes.',
  options: [
    { id: 'a', texte: 'Vrai' },
    { id: 'b', texte: 'Faux' },
  ],
  bonnesReponses: ['a'],
  explication: 'Obligation triennale.',
  formationIds: ['formation-1'],
  theme: 'reglementaire',
  difficulte: 1,
  statut: 'publiee',
};

const FORMATION = { airtableId: 'rec123', nom: 'Parodontie', cible: 'dentiste', format: 'e-learning', actif: true };

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
    await setDoc(doc(contexte.firestore(), 'questions/q1'), QUESTION);
    await setDoc(doc(contexte.firestore(), 'formations/f1'), FORMATION);
  });
}

describe('Référentiel — questions et formations', () => {
  it('un commercial du domaine lit une question', async () => {
    await semer();
    await assertSucceeds(getDoc(doc(connecte(env, JORDAN), 'questions/q1')));
  });

  it('un commercial du domaine lit une formation', async () => {
    await semer();
    await assertSucceeds(getDoc(doc(connecte(env, JORDAN), 'formations/f1')));
  });

  it("REFUS — un visiteur non authentifié ne lit aucune question", async () => {
    await semer();
    await assertFails(getDoc(doc(anonyme(env), 'questions/q1')));
  });

  it('REFUS — un utilisateur hors du domaine medere.fr ne lit aucune question', async () => {
    await semer();
    await assertFails(getDoc(doc(connecte(env, EXTERNE), 'questions/q1')));
  });

  it('REFUS — un utilisateur hors du domaine medere.fr ne lit aucune formation', async () => {
    await semer();
    await assertFails(getDoc(doc(connecte(env, EXTERNE), 'formations/f1')));
  });

  it("REFUS — une adresse du domaine dont l'e-mail n'est pas vérifié est traitée comme extérieure", async () => {
    await semer();
    const client = connecte(env, { ...JORDAN, emailVerifie: false });
    await assertFails(getDoc(doc(client, 'questions/q1')));
  });

  it("REFUS — un non-administrateur ne crée pas de question", async () => {
    await assertFails(setDoc(doc(connecte(env, JORDAN), 'questions/q2'), QUESTION));
  });

  it("REFUS — un non-administrateur ne modifie pas une question", async () => {
    await semer();
    await assertFails(
      updateDoc(doc(connecte(env, JORDAN), 'questions/q1'), { statut: 'brouillon' }),
    );
  });

  it("REFUS — un non-administrateur ne supprime pas une question", async () => {
    await semer();
    await assertFails(deleteDoc(doc(connecte(env, JORDAN), 'questions/q1')));
  });

  it("REFUS — un non-administrateur n'écrit pas de formation", async () => {
    await assertFails(setDoc(doc(connecte(env, JORDAN), 'formations/f2'), FORMATION));
  });

  it("REFUS — un jeton portant le claim admin mais une adresse hors domaine n'écrit rien", async () => {
    const usurpateur = connecte(env, { ...EXTERNE, admin: true });
    await assertFails(setDoc(doc(usurpateur, 'questions/q3'), QUESTION));
  });

  it('un administrateur crée puis modifie une question', async () => {
    const admin = connecte(env, NOEMIE);
    await assertSucceeds(setDoc(doc(admin, 'questions/q4'), QUESTION));
    await assertSucceeds(updateDoc(doc(admin, 'questions/q4'), { statut: 'brouillon' }));
  });

  it('un administrateur écrit une formation', async () => {
    await assertSucceeds(setDoc(doc(connecte(env, NOEMIE), 'formations/f3'), FORMATION));
  });
});
