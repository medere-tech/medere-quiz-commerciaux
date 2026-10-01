import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';

import {
  anonyme,
  connecte,
  creerEnvironnement,
  EXTERNE,
  JORDAN,
  NOEMIE,
  question,
  repondreAvecEtat,
  reponse,
} from './aide';

/**
 * États par question : `users/{uid}/etats/{questionId}`.
 *
 * Ce que ces tests protègent, dans l'ordre d'importance :
 *
 * 1. **L'isolation.** Personne ne lit l'état d'un autre, administrateur
 *    compris. C'est la même règle que pour les réponses, et pour la même
 *    raison : Noémie ne doit pas pouvoir savoir qui rate quoi par ce chemin —
 *    elle lit la maîtrise par le serveur, depuis le 30 septembre 2026.
 * 2. **Le lien avec la réponse.** Depuis le 1er octobre 2026, les états
 *    portent les taux de l'équipe et la maîtrise que lit l'équipe
 *    pédagogique. Un état ne s'écrit qu'avec la réponse qu'il nomme, née dans
 *    le même lot, et ses compteurs suivent le verdict de cette réponse.
 * 3. **La monotonie des compteurs** et **la forme exacte.**
 *
 * Chaque refus passe par un lot complet dont **un seul** élément ment : c'est
 * ce mensonge-là qui doit faire tomber l'écriture, pas l'absence d'autre chose.
 */

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await creerEnvironnement();
});

beforeEach(async () => {
  await env.withSecurityRulesDisabled(async (contexte) => {
    await setDoc(doc(contexte.firestore(), 'questions/q1'), question());
    await setDoc(doc(contexte.firestore(), 'questions/q2'), question());
  });
});

afterEach(async () => {
  await env.clearFirestore();
});

afterAll(async () => {
  await env.cleanup();
});

function chemin(uid: string, questionId = 'q1'): string {
  return `users/${uid}/etats/${questionId}`;
}

/** Un état déjà en base : une tentative ratée, deux au total, une réussie. */
async function semer(uid: string): Promise<void> {
  await env.withSecurityRulesDisabled(async (contexte) => {
    await setDoc(doc(contexte.firestore(), chemin(uid)), {
      reussies: 1,
      tentatives: 2,
      derniereRatee: true,
      majLe: new Date('2026-09-08T08:00:00Z'),
      derniereReponse: 'q1_ancienne',
    });
    await setDoc(
      doc(contexte.firestore(), `users/${uid}/reponses/q1_ancienne`),
      reponse({ repondueLe: new Date('2026-09-08T08:00:00Z') }),
    );
  });
}

const JUSTE = reponse({ correcte: true, optionsChoisies: ['a'] });

describe('Isolation des états', () => {
  it('le propriétaire lit son propre état', async () => {
    await semer(JORDAN.uid);
    await assertSucceeds(getDoc(doc(connecte(env, JORDAN), chemin(JORDAN.uid))));
  });

  it('REFUS — l’administrateur ne lit pas l’état d’un commercial', async () => {
    await semer(JORDAN.uid);
    await assertFails(getDoc(doc(connecte(env, NOEMIE), chemin(JORDAN.uid))));
  });

  it('REFUS — un commercial ne lit pas l’état d’un autre', async () => {
    await semer(NOEMIE.uid);
    await assertFails(getDoc(doc(connecte(env, JORDAN), chemin(NOEMIE.uid))));
  });

  it('REFUS — un visiteur non authentifié ne lit rien', async () => {
    await semer(JORDAN.uid);
    await assertFails(getDoc(doc(anonyme(env), chemin(JORDAN.uid))));
  });

  it('REFUS — un utilisateur hors domaine ne lit rien', async () => {
    await semer(EXTERNE.uid);
    await assertFails(getDoc(doc(connecte(env, EXTERNE), chemin(EXTERNE.uid))));
  });

  it('REFUS — écrire l’état d’un autre', async () => {
    await assertFails(repondreAvecEtat(connecte(env, JORDAN), NOEMIE.uid).ecriture);
  });
});

describe('Une réponse et son état, ensemble', () => {
  it('accepte une première tentative, avec sa réponse', async () => {
    await assertSucceeds(repondreAvecEtat(connecte(env, JORDAN), JORDAN.uid, JUSTE).ecriture);
  });

  it('accepte une tentative de plus, avec sa réponse', async () => {
    await semer(JORDAN.uid);
    await assertSucceeds(repondreAvecEtat(connecte(env, JORDAN), JORDAN.uid, JUSTE).ecriture);
  });

  it('REFUS — un état écrit sans réponse', async () => {
    // La faille du 1er octobre 2026 : depuis la console, un commercial
    // s'écrivait des réussites sans répondre, et faussait les taux de l'équipe.
    await assertFails(
      setDoc(doc(connecte(env, JORDAN), chemin(JORDAN.uid)), {
        reussies: 1,
        tentatives: 1,
        derniereRatee: false,
        majLe: serverTimestamp(),
        derniereReponse: 'q1_inventee',
      }),
    );
  });

  it('REFUS — une réponse écrite sans son état', async () => {
    // Le sens inverse : des réponses sans état feraient diverger la
    // répartition d'une question de son taux.
    await assertFails(setDoc(doc(connecte(env, JORDAN), `users/${JORDAN.uid}/reponses/q1_seule`), JUSTE));
  });

  it('REFUS — un état qui nomme une réponse ancienne', async () => {
    // Rejouer une vieille réponse juste pour gagner une réussite de plus.
    await semer(JORDAN.uid);
    await assertFails(
      repondreAvecEtat(connecte(env, JORDAN), JORDAN.uid, JUSTE, { derniereReponse: 'q1_ancienne' })
        .ecriture,
    );
  });

  it('REFUS — une réussite comptée sur une réponse fausse', async () => {
    await assertFails(
      repondreAvecEtat(connecte(env, JORDAN), JORDAN.uid, reponse(), {
        reussies: 1,
        derniereRatee: false,
      }).ecriture,
    );
  });

  it('REFUS — un état qui dit « ratée » sur une réponse juste', async () => {
    await assertFails(
      repondreAvecEtat(connecte(env, JORDAN), JORDAN.uid, JUSTE, { derniereRatee: true }).ecriture,
    );
  });

  it('REFUS — la réponse d’une question, l’état d’une autre', async () => {
    const base = connecte(env, JORDAN);
    const lot = writeBatch(base);
    lot.set(doc(base, `users/${JORDAN.uid}/reponses/q1_croisee`), JUSTE);
    lot.set(doc(base, chemin(JORDAN.uid, 'q2')), {
      reussies: 1,
      tentatives: 1,
      derniereRatee: false,
      majLe: serverTimestamp(),
      derniereReponse: 'q1_croisee',
    });
    await assertFails(lot.commit());
  });

  it('REFUS — deux réponses pour un seul état', async () => {
    // Un état nomme une réponse ; la seconde n'est nommée par personne.
    const base = connecte(env, JORDAN);
    const lot = writeBatch(base);
    lot.set(doc(base, `users/${JORDAN.uid}/reponses/q1_une`), JUSTE);
    lot.set(doc(base, `users/${JORDAN.uid}/reponses/q1_deux`), JUSTE);
    lot.set(doc(base, chemin(JORDAN.uid)), {
      reussies: 1,
      tentatives: 1,
      derniereRatee: false,
      majLe: serverTimestamp(),
      derniereReponse: 'q1_une',
    });
    await assertFails(lot.commit());
  });
});

describe('Forme et monotonie', () => {
  it('REFUS — une création qui annonce plusieurs tentatives', async () => {
    // Créer directement un état à cinquante tentatives contournerait la
    // monotonie que les mises à jour font respecter.
    await assertFails(
      repondreAvecEtat(connecte(env, JORDAN), JORDAN.uid, JUSTE, { tentatives: 50, reussies: 50 })
        .ecriture,
    );
  });

  it('REFUS — deux tentatives d’un coup', async () => {
    await semer(JORDAN.uid);
    await assertFails(
      repondreAvecEtat(connecte(env, JORDAN), JORDAN.uid, JUSTE, { tentatives: 4, reussies: 2 })
        .ecriture,
    );
  });

  it('REFUS — un compteur qui redescend', async () => {
    await semer(JORDAN.uid);
    await assertFails(
      repondreAvecEtat(connecte(env, JORDAN), JORDAN.uid, reponse(), { tentatives: 1, reussies: 0 })
        .ecriture,
    );
  });

  it('REFUS — un champ libre en plus', async () => {
    await assertFails(
      repondreAvecEtat(connecte(env, JORDAN), JORDAN.uid, JUSTE, { triche: true }).ecriture,
    );
  });

  it('REFUS — un horodatage qui n’est pas celui du serveur', async () => {
    // `majLe` fait la « dernière activité » que lit l'équipe pédagogique.
    await assertFails(
      repondreAvecEtat(connecte(env, JORDAN), JORDAN.uid, JUSTE, {
        majLe: new Date('2026-09-08T08:00:00Z'),
      }).ecriture,
    );
  });

  it('REFUS — supprimer un état', async () => {
    await semer(JORDAN.uid);
    await assertFails(deleteDoc(doc(connecte(env, JORDAN), chemin(JORDAN.uid))));
  });
});
