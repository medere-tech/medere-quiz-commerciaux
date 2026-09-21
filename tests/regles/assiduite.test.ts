import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, updateDoc } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest';

import { connecte, creerEnvironnement, JORDAN, utilisateur } from './aide';

/**
 * L'assiduité — la semaine en cours, la série de jours d'affilée, le record.
 *
 * **C'est le client qui écrit ces trois nombres**, comme il écrit ses étoiles.
 * Les règles tiennent donc le même rôle ici que là : le record ne redescend
 * pas, la série ne saute pas de palier, et la semaine ne dépasse pas sept
 * entrées.
 *
 * **La borne des sept entrées est ce qui empêche le champ de grossir.** Elle
 * vit ici, et pas seulement dans le code qui l'écrit : un document par jour
 * aurait fait mille documents par commercial sur trois ans, et le choix de
 * n'en faire aucun ne tient que si la règle l'impose.
 *
 * Ce que ces règles ne garantissent pas, et qui est assumé : c'est l'horloge
 * du navigateur qui décide du jour.
 */

let env: RulesTestEnvironment;

const CHEMIN = `users/${JORDAN.uid}`;

const ASSIDUITE = {
  dernierJour: '2026-03-18',
  serie: 3,
  record: 5,
  semaine: ['2026-03-16', '2026-03-17', '2026-03-18'],
};

/** Le document utilisateur, avec ou sans assiduité déjà posée. */
async function semer(avecAssiduite: boolean) {
  await env.withSecurityRulesDisabled(async (contexte) => {
    await contexte
      .firestore()
      .doc(CHEMIN)
      .set(utilisateur(avecAssiduite ? { assiduite: ASSIDUITE } : {}));
  });
}

function ecrire(assiduite: unknown) {
  return updateDoc(doc(connecte(env, JORDAN), CHEMIN), { assiduite });
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
    await semer(false);
    await assertSucceeds(
      ecrire({ dernierJour: '2026-03-19', serie: 1, record: 1, semaine: ['2026-03-19'] }),
    );
  });

  it('une série qui avance d’un cran, record compris', async () => {
    await semer(true);
    await assertSucceeds(
      ecrire({
        dernierJour: '2026-03-19',
        serie: 4,
        record: 5,
        semaine: [...ASSIDUITE.semaine, '2026-03-19'],
      }),
    );
  });

  /* Un jour manqué remet le compteur à un — c'est une remise, pas une baisse. */
  it('une série qui repart à un après un jour manqué', async () => {
    await semer(true);
    await assertSucceeds(
      ecrire({ dernierJour: '2026-03-20', serie: 1, record: 5, semaine: ['2026-03-20'] }),
    );
  });

  it('une semaine complète de sept jours', async () => {
    await semer(true);
    await assertSucceeds(
      ecrire({
        dernierJour: '2026-03-22',
        serie: 4,
        record: 5,
        semaine: [
          '2026-03-16',
          '2026-03-17',
          '2026-03-18',
          '2026-03-19',
          '2026-03-20',
          '2026-03-21',
          '2026-03-22',
        ],
      }),
    );
  });

  it('un record qui monte avec la série', async () => {
    await semer(true);
    await assertSucceeds(
      ecrire({
        dernierJour: '2026-03-19',
        serie: 4,
        record: 6,
        semaine: ['2026-03-19'],
      }),
    );
  });
});

/* ------------------------------------------------------------------- refusé */

describe('Ce que les règles refusent', () => {
  it('REFUS — un record en baisse', async () => {
    await semer(true);
    await assertFails(
      ecrire({ dernierJour: '2026-03-19', serie: 4, record: 4, semaine: ['2026-03-19'] }),
    );
  });

  /*
   * **Le cas que la borne existe pour attraper.** Une série qui passe de trois
   * à cinq d'une écriture n'a pas été vécue : elle a été écrite.
   */
  it('REFUS — une série qui saute un palier', async () => {
    await semer(true);
    await assertFails(
      ecrire({ dernierJour: '2026-03-19', serie: 5, record: 5, semaine: ['2026-03-19'] }),
    );
  });

  it('REFUS — une semaine de huit jours', async () => {
    await semer(true);
    await assertFails(
      ecrire({
        dernierJour: '2026-03-22',
        serie: 4,
        record: 5,
        semaine: [
          '2026-03-15',
          '2026-03-16',
          '2026-03-17',
          '2026-03-18',
          '2026-03-19',
          '2026-03-20',
          '2026-03-21',
          '2026-03-22',
        ],
      }),
    );
  });

  it('REFUS — une semaine vide', async () => {
    await semer(true);
    await assertFails(ecrire({ dernierJour: '2026-03-19', serie: 4, record: 5, semaine: [] }));
  });

  it('REFUS — une série à zéro', async () => {
    await semer(true);
    await assertFails(
      ecrire({ dernierJour: '2026-03-19', serie: 0, record: 5, semaine: ['2026-03-19'] }),
    );
  });

  it('REFUS — un record inférieur à la série', async () => {
    await semer(false);
    await assertFails(
      ecrire({ dernierJour: '2026-03-19', serie: 3, record: 1, semaine: ['2026-03-19'] }),
    );
  });

  it('REFUS — une série qui n’est pas un entier', async () => {
    await semer(true);
    await assertFails(
      ecrire({ dernierJour: '2026-03-19', serie: 3.5, record: 5, semaine: ['2026-03-19'] }),
    );
  });

  it('REFUS — un jour qui n’est pas une date de calendrier', async () => {
    await semer(true);
    await assertFails(
      ecrire({ dernierJour: '19 mars', serie: 4, record: 5, semaine: ['2026-03-19'] }),
    );
  });

  it('REFUS — un champ inconnu glissé dans l’assiduité', async () => {
    await semer(true);
    await assertFails(
      ecrire({
        dernierJour: '2026-03-19',
        serie: 4,
        record: 5,
        semaine: ['2026-03-19'],
        multiplicateur: 3,
      }),
    );
  });

  it('REFUS — une assiduité amputée d’un champ', async () => {
    await semer(true);
    await assertFails(ecrire({ dernierJour: '2026-03-19', serie: 4, record: 5 }));
  });

  /* Les scores restent privés : l'assiduité d'un autre ne se lit ni ne s'écrit. */
  it('REFUS — écrire l’assiduité de quelqu’un d’autre', async () => {
    await semer(true);
    await assertFails(
      updateDoc(doc(connecte(env, { ...JORDAN, uid: 'autre-uid' }), CHEMIN), {
        assiduite: { dernierJour: '2026-03-19', serie: 4, record: 5, semaine: ['2026-03-19'] },
      }),
    );
  });
});
