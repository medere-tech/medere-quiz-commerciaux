import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest';

import { anonyme, connecte, creerEnvironnement, JORDAN, NOEMIE } from './aide';

let env: RulesTestEnvironment;

const ANCIEN_AGREGAT = { tentatives: 12, echecs: 5, majLe: new Date('2026-09-01T08:00:00Z') };

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
    await setDoc(doc(contexte.firestore(), 'questionStats/q1'), ANCIEN_AGREGAT);
  });
}

describe('Ancienne collection questionStats, retirée le 1er octobre 2026', () => {
  /*
   * Les taux d'échec se calculent désormais côté serveur, à la lecture, sur
   * les états des commerciaux. La collection n'a plus de règle : elle tombe
   * sous le refus par défaut. Ces tests existent pour qu'une règle oubliée
   * ou rajoutée ne la rouvre pas — à l'administrateur comme à quiconque —
   * sans qu'on s'en aperçoive.
   */
  it("REFUS — l'administrateur ne lit plus questionStats", async () => {
    await semer();
    await assertFails(getDoc(doc(connecte(env, NOEMIE), 'questionStats/q1')));
  });

  it('REFUS — un commercial ne lit pas questionStats', async () => {
    await semer();
    await assertFails(getDoc(doc(connecte(env, JORDAN), 'questionStats/q1')));
  });

  it('REFUS — un visiteur non authentifié ne lit pas questionStats', async () => {
    await semer();
    await assertFails(getDoc(doc(anonyme(env), 'questionStats/q1')));
  });

  it('REFUS — aucun client n’écrit dans questionStats', async () => {
    await semer();
    await assertFails(setDoc(doc(connecte(env, JORDAN), 'questionStats/q3'), ANCIEN_AGREGAT));
    await assertFails(updateDoc(doc(connecte(env, NOEMIE), 'questionStats/q1'), { echecs: 0 }));
    await assertFails(deleteDoc(doc(connecte(env, NOEMIE), 'questionStats/q1')));
  });

  it('REFUS — les anciens marqueurs d’événements restent fermés', async () => {
    await env.withSecurityRulesDisabled(async (contexte) => {
      await setDoc(doc(contexte.firestore(), 'questionStats/q1/evenements/e1'), {
        expireLe: new Date('2026-09-10T08:00:00Z'),
      });
    });
    await assertFails(getDoc(doc(connecte(env, NOEMIE), 'questionStats/q1/evenements/e1')));
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
