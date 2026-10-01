import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { baseCourante, poserBase } from './aide';
import { connecte, creerEnvironnement, HIER, JORDAN, question, session } from '../regles/aide';
import { documentUtilisateurNeuf } from '@/lib/auth/document-utilisateur';

/**
 * Le premier jour d'un commercial, de bout en bout.
 *
 * **Pourquoi ce fichier existe.** Un compte neuf ne pouvait enregistrer aucune
 * série : les règles exigent un avatar et un nom de séance que la connexion ne
 * posait pas. Le défaut a survécu jusqu'à la veille de l'ouverture parce
 * qu'**aucun compte neuf n'avait jamais été exercé** : tous les tests partaient
 * de la fixture `utilisateur()`, qui pose ces deux champs d'office, et tous les
 * comptes de recette avaient déjà rejoint une séance, seul endroit qui les
 * écrivait.
 *
 * Ici, le compte part de l'état exact où la connexion le crée —
 * `documentUtilisateurNeuf`, la fonction même de la route — et chaque écriture
 * qu'un commercial fait depuis son navigateur est jouée par **le vrai code du
 * dépôt**, sous **les vraies règles**, sur l'émulateur. Seule la base est
 * injectée. Si une règle exige demain un champ que la connexion ne pose pas,
 * c'est ce fichier qui tombe, pas le premier jour de quelqu'un.
 */

vi.mock(import('@/lib/firebase/firestore'), () => ({ baseDeDonnees: () => baseCourante() }));

const { enregistrerReponse, crediterSerie } = await import('@/lib/serie/depot');
const { frapperALaPorte, memoriserNomSession, rejoindre, repondreEnSession } = await import(
  '@/lib/session/depot'
);

const CATALOGUE_VIDE = {
  formationsMaitrisees: 0,
  formationsSolides: 0,
  formationsTotal: 1,
  situationsJustes: 0,
  situationsVues: 0,
  situationsRatees: 0,
};

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

/** Un compte tel que la connexion le crée, une question publiée, une séance ouverte. */
beforeEach(async () => {
  await env.withSecurityRulesDisabled(async (contexte) => {
    const base = contexte.firestore();
    await setDoc(
      doc(base, `users/${JORDAN.uid}`),
      documentUtilisateurNeuf(
        { email: JORDAN.email, nom: 'Jordan Martin', photoURL: '', admin: false },
        HIER,
      ),
    );
    await setDoc(doc(base, 'questions/q-vf'), question());
    await setDoc(doc(base, 'sessions/s1'), session({ questionIds: ['q-vf'] }));
    await setDoc(doc(base, 'sessions/porte'), session({ code: 'PORTE1', verrouillee: true }));
  });
  poserBase(connecte(env, JORDAN));
});

async function relire(chemin: string): Promise<Record<string, unknown> | undefined> {
  let donnees: Record<string, unknown> | undefined;
  await env.withSecurityRulesDisabled(async (contexte) => {
    donnees = (await getDoc(doc(contexte.firestore(), chemin))).data();
  });
  return donnees;
}

describe('Une série, le premier jour', () => {
  it('enregistre ses réponses', async () => {
    await assertSucceeds(enregistrerReponse(JORDAN.uid, 'q-vf', ['a'], true));
  });

  it('crédite sa première série : étoiles, assiduité, récompenses', async () => {
    const reponse = await enregistrerReponse(JORDAN.uid, 'q-vf', ['a'], true);
    await assertSucceeds(
      crediterSerie(JORDAN.uid, 3, reponse, { parfaite: true, catalogue: CATALOGUE_VIDE }),
    );

    expect(await relire(`users/${JORDAN.uid}`)).toMatchObject({ etoiles: 3, seriesTerminees: 1 });
  });

  it('crédite une deuxième série le même jour, sur une réponse nouvelle', async () => {
    const premiere = await enregistrerReponse(JORDAN.uid, 'q-vf', ['a'], true);
    await crediterSerie(JORDAN.uid, 1, premiere, { parfaite: false, catalogue: CATALOGUE_VIDE });
    const seconde = await enregistrerReponse(JORDAN.uid, 'q-vf', ['b'], false);
    await assertSucceeds(
      crediterSerie(JORDAN.uid, 2, seconde, { parfaite: false, catalogue: CATALOGUE_VIDE }),
    );
  });

  it('REFUS — créditer une série sans avoir répondu depuis le crédit précédent', async () => {
    // Le défaut d'avant le 1er octobre 2026 : une boucle de crédits depuis la
    // console fabriquait des séries terminées et une assiduité sans jouer.
    const reponse = await enregistrerReponse(JORDAN.uid, 'q-vf', ['a'], true);
    await crediterSerie(JORDAN.uid, 3, reponse, { parfaite: true, catalogue: CATALOGUE_VIDE });
    await assertFails(
      crediterSerie(JORDAN.uid, 3, reponse, { parfaite: true, catalogue: CATALOGUE_VIDE }),
    );
  });
});

describe('Une séance, le premier jeudi', () => {
  it('mémorise un nom de séance avant d’entrer', async () => {
    await assertSucceeds(memoriserNomSession(JORDAN.uid, 'Jordan M.'));
  });

  it('rejoint la séance', async () => {
    await assertSucceeds(rejoindre('s1', JORDAN.uid, 'Jordan M.', 'orange', 'salle'));
  });

  it('répond à la question en cours', async () => {
    await rejoindre('s1', JORDAN.uid, 'Jordan M.', 'orange', 'salle');
    await assertSucceeds(repondreEnSession('s1', JORDAN.uid, 'q-vf', ['a'], true));
  });

  it('frappe à la porte d’une séance verrouillée', async () => {
    await assertSucceeds(frapperALaPorte('porte', JORDAN.uid, 'Jordan M.', 'encre'));
  });
});
