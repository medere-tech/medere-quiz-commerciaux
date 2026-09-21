import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, updateDoc } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest';

import { connecte, creerEnvironnement, HIER, NOEMIE, question } from './aide';

/**
 * La signature d'une explication, côté règles.
 *
 * **La date de mise à jour est une garantie, pas une politesse du client.**
 * L'écran du commercial annonce « mise à jour le… » juste à côté de
 * l'explication : si une correction de virgule pouvait faire avancer cette
 * date, elle n'apprendrait plus rien. `modifieeLe`, lui, suit chaque
 * enregistrement — c'est ce qui classe la banque, et c'est son rôle.
 *
 * L'argumentaire et la signature restent **facultatifs**. Pas pour ménager les
 * questions existantes — la base est de la recette — mais parce qu'une
 * question de fait n'a pas d'angle de vente, et qu'une question importée n'a
 * personne à créditer tant que Noémie n'y a pas touché.
 */

let env: RulesTestEnvironment;

const CHEMIN = 'questions/q-signature';
/* Antérieure à `HIER`, et distincte : si les deux dates étaient égales, une
   écriture qui « fait avancer » la date ne la ferait pas bouger du tout, et le
   test passerait pour la mauvaise raison. */
const AVANT = new Date('2026-08-20T09:00:00Z');

/** Une question publiée, signée ou non. */
async function semer(signee: boolean) {
  await env.withSecurityRulesDisabled(async (contexte) => {
    await contexte
      .firestore()
      .doc(CHEMIN)
      .set(
        question({
          explication: 'Le seuil d’indemnisation est de six heures.',
          ...(signee
            ? {
                argumentaire: 'Annoncez-le avant la signature.',
                explicationAuteur: 'Noémie Vasseur',
                explicationMajLe: AVANT,
              }
            : {}),
        }),
      );
  });
}

function ecrire(champs: Record<string, unknown>) {
  return updateDoc(doc(connecte(env, NOEMIE), CHEMIN), champs);
}

beforeAll(async () => {
  env = await creerEnvironnement();
});

afterEach(async () => {
  await env.clearFirestore();
});

afterAll(async () => {
  await env.cleanup();
});

/* ------------------------------------------------------------------ accepté */

describe('Ce que les règles acceptent', () => {
  it('une question sans argumentaire ni signature', async () => {
    await semer(false);
    await assertSucceeds(ecrire({ theme: 'financement', modifieeLe: HIER }));
  });

  it('une première signature quand l’explication est réécrite', async () => {
    await semer(false);
    await assertSucceeds(
      ecrire({
        explication: 'Le seuil est de huit heures.',
        explicationAuteur: 'Noémie Vasseur',
        explicationMajLe: HIER,
        modifieeLe: HIER,
      }),
    );
  });

  it('une explication réécrite, avec sa date qui avance', async () => {
    await semer(true);
    await assertSucceeds(
      ecrire({
        explication: 'Le seuil est de huit heures.',
        explicationMajLe: HIER,
        modifieeLe: HIER,
      }),
    );
  });

  /*
   * **Le cas de tous les jours.** Une faute de frappe corrigée ailleurs dans
   * la question : `modifieeLe` avance, la date de l'explication non.
   */
  it('une correction ailleurs, la date de l’explication inchangée', async () => {
    await semer(true);
    await assertSucceeds(ecrire({ enonce: 'Quelle durée minimale ?', modifieeLe: HIER }));
  });

  it('un argumentaire ajouté, avec sa date', async () => {
    await semer(true);
    await assertSucceeds(
      ecrire({
        argumentaire: 'Dites-le dès la découverte.',
        explicationMajLe: HIER,
        modifieeLe: HIER,
      }),
    );
  });
});

/* ------------------------------------------------------------------- refusé */

describe('Ce que les règles refusent', () => {
  /*
   * **Le cas qui donne son sens à la règle.** Rien n'a changé dans
   * l'explication ni dans l'argumentaire, et la date avancerait quand même :
   * « mise à jour le 3 mars » sur un changement de virgule n'apprend rien.
   */
  it('REFUS — faire avancer la date sans toucher au texte', async () => {
    await semer(true);
    await assertFails(ecrire({ explicationMajLe: HIER, modifieeLe: HIER }));
  });

  it('REFUS — faire avancer la date en ne changeant que l’énoncé', async () => {
    await semer(true);
    await assertFails(
      ecrire({ enonce: 'Quelle durée ?', explicationMajLe: HIER, modifieeLe: HIER }),
    );
  });

  it('REFUS — poser une première date sans rien écrire', async () => {
    await semer(false);
    await assertFails(
      ecrire({ explicationAuteur: 'Noémie Vasseur', explicationMajLe: HIER, modifieeLe: HIER }),
    );
  });

  it('REFUS — un argumentaire au-delà de sa borne', async () => {
    await semer(true);
    await assertFails(
      ecrire({
        argumentaire: 'a'.repeat(601),
        explicationMajLe: HIER,
        modifieeLe: HIER,
      }),
    );
  });

  it('REFUS — une signature au-delà de sa borne', async () => {
    await semer(true);
    await assertFails(
      ecrire({
        explication: 'Un autre texte.',
        explicationAuteur: 'n'.repeat(61),
        explicationMajLe: HIER,
        modifieeLe: HIER,
      }),
    );
  });

  it('REFUS — une date d’explication dans le futur', async () => {
    await semer(true);
    const futur = new Date(Date.now() + 86_400_000);
    await assertFails(
      ecrire({ explication: 'Un autre texte.', explicationMajLe: futur, modifieeLe: HIER }),
    );
  });
});
