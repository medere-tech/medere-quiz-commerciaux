import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest';

import { connecte, creerEnvironnement, EXTERNE, JORDAN, NOEMIE, SOPHIE } from './aide';

/**
 * Le podium de régularité, côté règles.
 *
 * **Ce que ces règles gardent tient en une phrase : on nomme trois personnes,
 * et rien de ce qui est lisible ne permet d'en déduire une quatrième.**
 *
 * L'écran 04b dessinait un classement complet de l'équipe sur le taux de
 * maîtrise. Sur une équipe de dix, un tel classement expose publiquement ceux
 * qui rament — et ce sont eux qui ont le plus besoin de l'outil. D'où la
 * coupure : un podium public sur la **régularité**, un rang **privé**.
 *
 * **La clause décisive n'est pas celle qui autorise, c'est `list: false`.**
 * Un `get` sur le podium ne dit que ce qu'on a choisi de dire ; une liste de
 * `personnel` rendrait le classement entier. Les tests de refus ci-dessous
 * sont donc le cœur du fichier, pas son ornement.
 */

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

/** Le podium publié, et le rang privé de Jordan. */
async function semer(): Promise<void> {
  await env.withSecurityRulesDisabled(async (contexte) => {
    const base = contexte.firestore();
    await setDoc(doc(base, 'classements/regularite'), {
      lignes: [
        { uid: SOPHIE.uid, nom: 'Sophie', avatar: 'rose', rang: 1, serie: 7, dernierJour: '2026-09-23' },
      ],
      autresAuDernierRang: 0,
      calculeLe: new Date(),
    });
    await setDoc(doc(base, `classements/regularite/personnel/${JORDAN.uid}`), {
      rang: 5,
      ecart: 2,
    });
  });
}

describe('le podium public', () => {
  it('se lit par tout le domaine : c’est le point de la fonctionnalité', async () => {
    await semer();

    await assertSucceeds(getDoc(doc(connecte(env, JORDAN), 'classements/regularite')));
  });

  it('REFUS — une adresse hors domaine ne le lit pas', async () => {
    await semer();

    await assertFails(getDoc(doc(connecte(env, EXTERNE), 'classements/regularite')));
  });

  /*
   * **Sans cette clause, tout le reste est décoratif.** Lister la collection
   * rendrait tous les documents de classement d'un coup — y compris ceux qui
   * n'ont pas vocation à être publiés.
   */
  it('REFUS — personne ne liste la collection des classements', async () => {
    await semer();

    await assertFails(getDocs(collection(connecte(env, JORDAN), 'classements')));
  });

  /* Un rang qu'on peut s'attribuer ne vaut rien : la Cloud Function écrit par
     le SDK Admin, hors de ces règles. */
  it('REFUS — aucun client n’écrit le podium, administratrice comprise', async () => {
    await semer();

    await assertFails(
      setDoc(doc(connecte(env, JORDAN), 'classements/regularite'), { lignes: [] }),
    );
    await assertFails(
      setDoc(doc(connecte(env, NOEMIE), 'classements/regularite'), { lignes: [] }),
    );
  });

  it('REFUS — personne ne l’efface', async () => {
    await semer();

    await assertFails(deleteDoc(doc(connecte(env, NOEMIE), 'classements/regularite')));
  });
});

describe('le rang personnel', () => {
  it('chacun lit le sien', async () => {
    await semer();

    await assertSucceeds(
      getDoc(doc(connecte(env, JORDAN), `classements/regularite/personnel/${JORDAN.uid}`)),
    );
  });

  /*
   * **La clause qui empêche la reconstitution.** Le rang de quelqu'un d'autre
   * dirait, mis bout à bout, qui est dernier — ce que le podium refuse
   * précisément d'afficher.
   */
  it('REFUS — personne ne lit le rang d’un autre', async () => {
    await semer();

    await assertFails(
      getDoc(doc(connecte(env, SOPHIE), `classements/regularite/personnel/${JORDAN.uid}`)),
    );
  });

  it('REFUS — l’administratrice non plus', async () => {
    await semer();

    await assertFails(
      getDoc(doc(connecte(env, NOEMIE), `classements/regularite/personnel/${JORDAN.uid}`)),
    );
  });

  /* Lister `personnel` serait le classement complet, nominatif, en une
     requête. C'est le contournement le plus direct, et il est fermé. */
  it('REFUS — personne ne liste les rangs', async () => {
    await semer();

    await assertFails(
      getDocs(collection(connecte(env, JORDAN), 'classements/regularite/personnel')),
    );
    await assertFails(
      getDocs(collection(connecte(env, NOEMIE), 'classements/regularite/personnel')),
    );
  });

  it('REFUS — on n’écrit pas son propre rang', async () => {
    await semer();

    await assertFails(
      setDoc(doc(connecte(env, JORDAN), `classements/regularite/personnel/${JORDAN.uid}`), {
        rang: 1,
        ecart: null,
      }),
    );
  });
});
