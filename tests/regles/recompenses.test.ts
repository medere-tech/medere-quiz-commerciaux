import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, updateDoc } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest';

import { connecte, creerEnvironnement, JORDAN, utilisateur } from './aide';

/**
 * Les récompenses — les paliers franchis, et le jour où ils l'ont été.
 *
 * **La garantie qui justifie de stocker plutôt que de dériver** : rien ne se
 * retire, rien ne se réécrit. Une récompense obtenue est un fait du passé. Si
 * les règles laissaient la reprendre, autant tout recalculer à l'affichage — et
 * « toutes les formations au-dessus de 80 % » s'évanouirait à la première
 * question publiée.
 *
 * **Le plafond borne la croissance**, et c'est son seul rôle. Les identifiants
 * ne sont pas figés ici : les y inscrire imposerait un déploiement de règles à
 * chaque palier ajouté.
 */

let env: RulesTestEnvironment;

const CHEMIN = `users/${JORDAN.uid}`;

const ACQUISES = {
  'dix-jours': '2026-03-10',
  'formation-maitrisee': '2026-03-12',
};

async function semer(avecRecompenses: boolean) {
  await env.withSecurityRulesDisabled(async (contexte) => {
    await contexte
      .firestore()
      .doc(CHEMIN)
      .set(utilisateur(avecRecompenses ? { recompenses: ACQUISES } : {}));
  });
}

function ecrire(recompenses: unknown) {
  return updateDoc(doc(connecte(env, JORDAN), CHEMIN), { recompenses });
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
  it('une première récompense, sur un compte qui n’en portait pas', async () => {
    await semer(false);
    await assertSucceeds(ecrire({ 'dix-jours': '2026-03-19' }));
  });

  it('une récompense de plus, les anciennes intactes', async () => {
    await semer(true);
    await assertSucceeds(ecrire({ ...ACQUISES, 'semaine-pleine': '2026-03-19' }));
  });

  it('une écriture qui ne change rien', async () => {
    await semer(true);
    await assertSucceeds(ecrire({ ...ACQUISES }));
  });

  /* Le plafond laisse de la place pour de futurs paliers sans redéploiement. */
  it('vingt-quatre récompenses', async () => {
    await semer(false);
    const carte: Record<string, string> = {};
    for (let rang = 0; rang < 24; rang += 1) carte[`palier-${rang}`] = '2026-03-19';
    await assertSucceeds(ecrire(carte));
  });
});

/* ------------------------------------------------------------------- refusé */

describe('Ce que les règles refusent', () => {
  /*
   * **Le cas qui compte.** Une récompense reprise serait pire que jamais
   * accordée : c'est exactement ce que la dérivation ferait toute seule, et la
   * raison pour laquelle on stocke.
   */
  it('REFUS — retirer une récompense obtenue', async () => {
    await semer(true);
    await assertFails(ecrire({ 'dix-jours': '2026-03-10' }));
  });

  it('REFUS — vider la carte', async () => {
    await semer(true);
    await assertFails(ecrire({}));
  });

  /* La date est celle du jour où elle a été gagnée, et elle ne bouge plus. */
  it('REFUS — réécrire la date d’une récompense obtenue', async () => {
    await semer(true);
    await assertFails(ecrire({ ...ACQUISES, 'dix-jours': '2026-03-19' }));
  });

  it('REFUS — vingt-cinq récompenses', async () => {
    await semer(false);
    const carte: Record<string, string> = {};
    for (let rang = 0; rang < 25; rang += 1) carte[`palier-${rang}`] = '2026-03-19';
    await assertFails(ecrire(carte));
  });

  /* Les scores restent privés : les paliers d'un autre ne s'écrivent pas. */
  it('REFUS — écrire les récompenses de quelqu’un d’autre', async () => {
    await semer(true);
    await assertFails(
      updateDoc(doc(connecte(env, { ...JORDAN, uid: 'autre-uid' }), CHEMIN), {
        recompenses: { ...ACQUISES, 'semaine-pleine': '2026-03-19' },
      }),
    );
  });
});
