import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest';

import {
  anonyme,
  connecte,
  creerEnvironnement,
  EXTERNE,
  formation,
  JORDAN,
  NOEMIE,
  question,
} from './aide';

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

async function semer(): Promise<void> {
  await env.withSecurityRulesDisabled(async (contexte) => {
    await setDoc(doc(contexte.firestore(), 'questions/q1'), question());
    await setDoc(doc(contexte.firestore(), 'formations/f1'), formation());
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

  it('REFUS — un visiteur non authentifié ne lit aucune question', async () => {
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

  it('REFUS — un non-administrateur ne crée pas de question', async () => {
    await assertFails(
      setDoc(doc(connecte(env, JORDAN), 'questions/q2'), question({ creeePar: JORDAN.uid })),
    );
  });

  it('REFUS — un non-administrateur ne modifie pas une question', async () => {
    await semer();
    await assertFails(
      updateDoc(doc(connecte(env, JORDAN), 'questions/q1'), { statut: 'brouillon' }),
    );
  });

  it('REFUS — un non-administrateur ne supprime pas une question', async () => {
    await semer();
    await assertFails(deleteDoc(doc(connecte(env, JORDAN), 'questions/q1')));
  });

  it("REFUS — un non-administrateur n'écrit pas de formation", async () => {
    await assertFails(setDoc(doc(connecte(env, JORDAN), 'formations/f2'), formation()));
  });

  it("REFUS — un jeton portant le claim admin mais une adresse hors domaine n'écrit rien", async () => {
    const usurpateur = connecte(env, { ...EXTERNE, admin: true });
    await assertFails(
      setDoc(doc(usurpateur, 'questions/q3'), question({ creeePar: EXTERNE.uid })),
    );
  });

  it('un administrateur crée puis modifie une question', async () => {
    const admin = connecte(env, NOEMIE);
    await assertSucceeds(setDoc(doc(admin, 'questions/q4'), question()));
    await assertSucceeds(updateDoc(doc(admin, 'questions/q4'), { statut: 'brouillon' }));
  });

  it('un administrateur écrit une formation', async () => {
    await assertSucceeds(setDoc(doc(connecte(env, NOEMIE), 'formations/f3'), formation()));
  });

  it('REFUS — une formation dont le nom est vide', async () => {
    await assertFails(
      setDoc(doc(connecte(env, NOEMIE), 'formations/f4'), formation({ nom: '' })),
    );
  });

  it('REFUS — une formation portant un champ hors modèle', async () => {
    await assertFails(
      setDoc(doc(connecte(env, NOEMIE), 'formations/f5'), formation({ tarif: 490 })),
    );
  });

  it("REFUS — une formation dont l'indicateur d'activité n'est pas un booléen", async () => {
    await assertFails(
      setDoc(doc(connecte(env, NOEMIE), 'formations/f6'), formation({ actif: 'oui' })),
    );
  });

  it("REFUS — une formation sans numéro d'action DPC", async () => {
    await assertFails(
      setDoc(doc(connecte(env, NOEMIE), 'formations/f7'), formation({ numeroActionDpc: '' })),
    );
  });

  it('REFUS — un public concerné fourni comme chaîne au lieu de liste', async () => {
    await assertFails(
      setDoc(
        doc(connecte(env, NOEMIE), 'formations/f8'),
        formation({ cibles: 'Chirurgien dentiste' }),
      ),
    );
  });

  it('REFUS — un public concerné répété', async () => {
    await assertFails(
      setDoc(
        doc(connecte(env, NOEMIE), 'formations/f9'),
        formation({ cibles: ['Pédiatre', 'Pédiatre'] }),
      ),
    );
  });

  it('REFUS — une formation privée de son champ modalité', async () => {
    const incomplete = { ...formation() };
    delete incomplete.modalite;
    await assertFails(setDoc(doc(connecte(env, NOEMIE), 'formations/f10'), incomplete));
  });

  it('un public concerné vide est accepté : Airtable peut ne rien renseigner', async () => {
    await assertSucceeds(
      setDoc(doc(connecte(env, NOEMIE), 'formations/f11'), formation({ cibles: [] })),
    );
  });

  it('un format et une modalité vides sont acceptés', async () => {
    await assertSucceeds(
      setDoc(
        doc(connecte(env, NOEMIE), 'formations/f12'),
        formation({ format: '', modalite: '', dureeTotale: '', urlWebflow: '' }),
      ),
    );
  });
});
