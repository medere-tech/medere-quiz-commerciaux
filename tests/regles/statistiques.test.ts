import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest';

import { anonyme, connecte, creerEnvironnement, EXTERNE, JORDAN, NOEMIE } from './aide';

let env: RulesTestEnvironment;

const STATS = { tentatives: 12, echecs: 5, majLe: new Date('2026-09-01T08:00:00Z') };

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
    await setDoc(doc(contexte.firestore(), 'questionStats/q1'), STATS);
  });
}

describe('Statistiques agrégées', () => {
  it("l'administrateur lit les statistiques", async () => {
    await semer();
    await assertSucceeds(getDoc(doc(connecte(env, NOEMIE), 'questionStats/q1')));
  });

  it('la Cloud Function, hors règles, écrit les statistiques', async () => {
    await env.withSecurityRulesDisabled(async (contexte) => {
      await assertSucceeds(setDoc(doc(contexte.firestore(), 'questionStats/q2'), STATS));
    });
  });

  it('REFUS — un commercial ne lit pas les statistiques', async () => {
    await semer();
    await assertFails(getDoc(doc(connecte(env, JORDAN), 'questionStats/q1')));
  });

  it('REFUS — un visiteur non authentifié ne lit pas les statistiques', async () => {
    await semer();
    await assertFails(getDoc(doc(anonyme(env), 'questionStats/q1')));
  });

  it('REFUS — un client crée un document de statistiques', async () => {
    await assertFails(setDoc(doc(connecte(env, JORDAN), 'questionStats/q3'), STATS));
  });

  it('REFUS — un client modifie un compteur de statistiques', async () => {
    await semer();
    await assertFails(updateDoc(doc(connecte(env, JORDAN), 'questionStats/q1'), { echecs: 0 }));
  });

  it("REFUS — un administrateur écrit dans les statistiques", async () => {
    await semer();
    await assertFails(updateDoc(doc(connecte(env, NOEMIE), 'questionStats/q1'), { echecs: 0 }));
    await assertFails(deleteDoc(doc(connecte(env, NOEMIE), 'questionStats/q1')));
  });

  it('REFUS — un utilisateur hors domaine ne lit pas les statistiques', async () => {
    await semer();
    await assertFails(getDoc(doc(connecte(env, EXTERNE), 'questionStats/q1')));
  });
});

describe('Marqueurs de dédoublonnage de l’agrégation', () => {
  /*
   * La Cloud Function pose un marqueur par événement traité, sous
   * `questionStats/{id}/evenements`. Aucune règle ne déclare ce chemin, donc
   * il est fermé — y compris à l'administrateur, qui n'a rien à y faire.
   * Le test existe pour qu'une future règle trop large sur `questionStats`
   * (un `{document=**}` distrait) ne l'ouvre pas sans qu'on s'en aperçoive.
   */
  async function semerMarqueur(): Promise<void> {
    await env.withSecurityRulesDisabled(async (contexte) => {
      await setDoc(doc(contexte.firestore(), 'questionStats/q1/evenements/e1'), {
        expireLe: new Date('2026-09-10T08:00:00Z'),
      });
    });
  }

  it('REFUS — l’administrateur ne lit pas les marqueurs', async () => {
    await semerMarqueur();
    await assertFails(getDoc(doc(connecte(env, NOEMIE), 'questionStats/q1/evenements/e1')));
  });

  it('REFUS — un commercial ne lit pas les marqueurs', async () => {
    await semerMarqueur();
    await assertFails(getDoc(doc(connecte(env, JORDAN), 'questionStats/q1/evenements/e1')));
  });

  it('REFUS — personne n’écrit de marqueur depuis un client', async () => {
    await assertFails(
      setDoc(doc(connecte(env, NOEMIE), 'questionStats/q1/evenements/e2'), { expireLe: new Date() }),
    );
  });
});

describe('État des synchronisations', () => {
  const ETAT = {
    lanceeLe: new Date('2026-09-02T06:00:00Z'),
    creees: 2,
    misesAJour: 40,
    desactivees: 1,
    rejetees: 0,
  };

  async function semerEtat(): Promise<void> {
    await env.withSecurityRulesDisabled(async (contexte) => {
      await setDoc(doc(contexte.firestore(), 'synchronisations/formations'), ETAT);
    });
  }

  it("l'administrateur lit le compte rendu de synchronisation", async () => {
    await semerEtat();
    await assertSucceeds(getDoc(doc(connecte(env, NOEMIE), 'synchronisations/formations')));
  });

  it('REFUS — un commercial lit le compte rendu de synchronisation', async () => {
    await semerEtat();
    await assertFails(getDoc(doc(connecte(env, JORDAN), 'synchronisations/formations')));
  });

  it('REFUS — un administrateur écrit le compte rendu de synchronisation', async () => {
    await semerEtat();
    await assertFails(
      updateDoc(doc(connecte(env, NOEMIE), 'synchronisations/formations'), { creees: 99 }),
    );
  });

  it('REFUS — un commercial crée un compte rendu de synchronisation', async () => {
    await assertFails(setDoc(doc(connecte(env, JORDAN), 'synchronisations/autre'), ETAT));
  });
});

describe('Collections non prévues', () => {
  it('REFUS — toute collection hors modèle est fermée, même pour un administrateur', async () => {
    await assertFails(setDoc(doc(connecte(env, NOEMIE), 'brouillons/x'), { valeur: 1 }));
    await assertFails(getDoc(doc(connecte(env, NOEMIE), 'brouillons/x')));
  });
});
