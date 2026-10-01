import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, updateDoc } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest';

import { clefDuJour } from '@/lib/serie/assiduite';

import { connecte, creerEnvironnement, credit, JORDAN, semerReponseRecente, utilisateur } from './aide';

/**
 * L'assiduité — la semaine en cours, la série de jours d'affilée, le record.
 *
 * **Le jour est celui du serveur.** Jusqu'au 1er octobre 2026, la règle ne
 * vérifiait que la forme et le pas : une première écriture pouvait poser une
 * série de cinq cents jours, et chaque écriture suivante en ajoutait un, en
 * quelques secondes. Or l'assiduité fait le podium de régularité, lisible par
 * tout le domaine.
 *
 * Elle ne s'écrit plus que dans le crédit d'une série (`creditDeSerie`) : chaque
 * scénario part donc d'un crédit conforme dont **seule l'assiduité** varie. Les
 * jours sont calculés à partir d'aujourd'hui — le jour de Paris, par la
 * fonction même du navigateur —, pas écrits en dur : la règle les compare à
 * l'horloge du serveur.
 *
 * **La borne des sept entrées** empêche toujours le champ de grossir : un
 * document par jour aurait fait mille documents par commercial sur trois ans.
 */

let env: RulesTestEnvironment;

const CHEMIN = `users/${JORDAN.uid}`;

const AUJOURDHUI = clefDuJour(new Date());

/** Le jour décalé de `jours`, dans le même format `AAAA-MM-JJ`. */
function decaler(jours: number): string {
  return new Date(Date.parse(`${AUJOURDHUI}T00:00:00Z`) + jours * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

const VEILLE = decaler(-1);

/** Une série de trois jours qui s'arrête hier, record à cinq. */
const ASSIDUITE = { dernierJour: VEILLE, serie: 3, record: 5, semaine: [VEILLE] };

async function semer(assiduite: Record<string, unknown> | null = ASSIDUITE) {
  await env.withSecurityRulesDisabled(async (contexte) => {
    await contexte
      .firestore()
      .doc(CHEMIN)
      .set(utilisateur(assiduite ? { assiduite } : {}));
  });
  await semerReponseRecente(env, JORDAN.uid);
}

/** Un crédit de série conforme, dont l'assiduité est celle qu'on éprouve. */
function crediter(assiduite: unknown) {
  return updateDoc(doc(connecte(env, JORDAN), CHEMIN), credit({ assiduite }));
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
  it('une première assiduité, sur un compte qui n’en portait pas', async () => {
    await semer(null);
    await assertSucceeds(
      crediter({ dernierJour: AUJOURDHUI, serie: 1, record: 1, semaine: [AUJOURDHUI] }),
    );
  });

  it('une série qui avance d’un cran, record compris', async () => {
    await semer();
    await assertSucceeds(
      crediter({ dernierJour: AUJOURDHUI, serie: 4, record: 5, semaine: [VEILLE, AUJOURDHUI] }),
    );
  });

  /* Un jour manqué remet le compteur à un — c'est une remise, pas une baisse. */
  it('une série qui repart à un après des jours manqués', async () => {
    await semer({ ...ASSIDUITE, dernierJour: decaler(-6), semaine: [decaler(-6)] });
    await assertSucceeds(
      crediter({ dernierJour: AUJOURDHUI, serie: 1, record: 5, semaine: [AUJOURDHUI] }),
    );
  });

  it('un record qui monte avec la série', async () => {
    await semer({ ...ASSIDUITE, serie: 5 });
    await assertSucceeds(
      crediter({ dernierJour: AUJOURDHUI, serie: 6, record: 6, semaine: [VEILLE, AUJOURDHUI] }),
    );
  });

  it('une seconde série le même jour, qui ne change rien', async () => {
    const dejaJoue = { dernierJour: AUJOURDHUI, serie: 3, record: 5, semaine: [AUJOURDHUI] };
    await semer(dejaJoue);
    await assertSucceeds(crediter(dejaJoue));
  });

  it('une semaine qui garde ses jours et atteint sept', async () => {
    const six = [-6, -5, -4, -3, -2, -1].map(decaler);
    await semer({ ...ASSIDUITE, semaine: six });
    await assertSucceeds(
      crediter({ dernierJour: AUJOURDHUI, serie: 4, record: 5, semaine: [...six, AUJOURDHUI] }),
    );
  });
});

/* ------------------------------------------------------------------- refusé */

describe('Ce que les règles refusent', () => {
  it('REFUS — une assiduité écrite hors d’un crédit de série', async () => {
    // Le défaut d'avant : n'importe quelle écriture du document la portait.
    await semer();
    await assertFails(
      updateDoc(doc(connecte(env, JORDAN), CHEMIN), {
        assiduite: { dernierJour: AUJOURDHUI, serie: 4, record: 5, semaine: [VEILLE, AUJOURDHUI] },
      }),
    );
  });

  it('REFUS — une première assiduité à cinq cents jours', async () => {
    await semer(null);
    await assertFails(
      crediter({ dernierJour: AUJOURDHUI, serie: 500, record: 500, semaine: [AUJOURDHUI] }),
    );
  });

  it('REFUS — un jour qui n’est pas celui du serveur', async () => {
    // Avancer sa montre ne fabrique plus de série.
    await semer();
    await assertFails(
      crediter({ dernierJour: decaler(2), serie: 4, record: 5, semaine: [decaler(2)] }),
    );
  });

  it('REFUS — une série qui avance deux fois le même jour', async () => {
    await semer({ dernierJour: AUJOURDHUI, serie: 3, record: 5, semaine: [AUJOURDHUI] });
    await assertFails(
      crediter({ dernierJour: AUJOURDHUI, serie: 4, record: 5, semaine: [AUJOURDHUI] }),
    );
  });

  it('REFUS — une série qui avance par-dessus des jours manqués', async () => {
    await semer({ ...ASSIDUITE, dernierJour: decaler(-6), semaine: [decaler(-6)] });
    await assertFails(
      crediter({ dernierJour: AUJOURDHUI, serie: 4, record: 5, semaine: [AUJOURDHUI] }),
    );
  });

  it('REFUS — une semaine qui gagne un autre jour qu’aujourd’hui', async () => {
    await semer();
    await assertFails(
      crediter({
        dernierJour: AUJOURDHUI,
        serie: 4,
        record: 5,
        semaine: [decaler(-3), VEILLE, AUJOURDHUI],
      }),
    );
  });

  it('REFUS — un record en baisse', async () => {
    await semer();
    await assertFails(
      crediter({ dernierJour: AUJOURDHUI, serie: 4, record: 4, semaine: [AUJOURDHUI] }),
    );
  });

  /*
   * **Le cas que la borne existe pour attraper.** Une série qui passe de trois
   * à cinq d'une écriture n'a pas été vécue : elle a été écrite.
   */
  it('REFUS — une série qui saute un palier', async () => {
    await semer();
    await assertFails(
      crediter({ dernierJour: AUJOURDHUI, serie: 5, record: 5, semaine: [AUJOURDHUI] }),
    );
  });

  it('REFUS — une semaine de huit jours', async () => {
    const sept = [-7, -6, -5, -4, -3, -2, -1].map(decaler);
    await semer({ ...ASSIDUITE, semaine: sept });
    await assertFails(
      crediter({ dernierJour: AUJOURDHUI, serie: 4, record: 5, semaine: [...sept, AUJOURDHUI] }),
    );
  });

  it('REFUS — une semaine vide', async () => {
    await semer();
    await assertFails(crediter({ dernierJour: AUJOURDHUI, serie: 4, record: 5, semaine: [] }));
  });

  it('REFUS — une série à zéro', async () => {
    await semer();
    await assertFails(
      crediter({ dernierJour: AUJOURDHUI, serie: 0, record: 5, semaine: [AUJOURDHUI] }),
    );
  });

  it('REFUS — une série qui n’est pas un entier', async () => {
    await semer();
    await assertFails(
      crediter({ dernierJour: AUJOURDHUI, serie: 3.5, record: 5, semaine: [AUJOURDHUI] }),
    );
  });

  it('REFUS — un jour qui n’est pas une date de calendrier', async () => {
    await semer();
    await assertFails(crediter({ dernierJour: '19 mars', serie: 4, record: 5, semaine: ['19 mars'] }));
  });

  it('REFUS — un champ inconnu glissé dans l’assiduité', async () => {
    await semer();
    await assertFails(
      crediter({
        dernierJour: AUJOURDHUI,
        serie: 4,
        record: 5,
        semaine: [AUJOURDHUI],
        multiplicateur: 3,
      }),
    );
  });

  it('REFUS — une assiduité amputée d’un champ', async () => {
    await semer();
    await assertFails(crediter({ dernierJour: AUJOURDHUI, serie: 4, record: 5 }));
  });

  /* Les scores restent privés : l'assiduité d'un autre ne se lit ni ne s'écrit. */
  it('REFUS — écrire l’assiduité de quelqu’un d’autre', async () => {
    await semer();
    await assertFails(
      updateDoc(
        doc(connecte(env, { ...JORDAN, uid: 'autre-uid' }), CHEMIN),
        credit({ assiduite: { dernierJour: AUJOURDHUI, serie: 4, record: 5, semaine: [AUJOURDHUI] } }),
      ),
    );
  });
});
