import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest';

import {
  connecte,
  creerEnvironnement,
  HIER,
  JORDAN,
  NOEMIE,
  participant,
  question,
  reponseSession,
  session,
  SOPHIE,
} from './aide';

/**
 * « Verrouiller l'accès », côté règles.
 *
 * **Le verrou ne ferme qu'une porte, et ces tests existent pour le prouver.**
 * Le mot suggère trois choses qu'il ne fait pas : suspendre la séance, sortir
 * les présents, périmer le code. La seule clause qu'il ajoute porte sur la
 * *création* d'un marqueur de présence. Tout le reste — voter, corriger son
 * nom, lire le classement — passe par d'autres règles, qui ne le regardent pas.
 *
 * **C'est la réponse à « que deviennent ceux qui sont déjà là ».** Elle n'est
 * pas une intention de code : elle est vérifiée ici, porte fermée, sur
 * quelqu'un qui était entré avant.
 */

let env: RulesTestEnvironment;

const SEANCE = 'sessions/s1';
const MARQUEUR = `${SEANCE}/participants/${JORDAN.uid}`;

/** Une séance ouverte, porte fermée ou non, avec Jordan déjà dans la salle. */
async function semer({ verrouillee, jordanPresent }: { verrouillee: boolean; jordanPresent: boolean }) {
  await env.withSecurityRulesDisabled(async (contexte) => {
    const base = contexte.firestore();
    await setDoc(doc(base, 'questions/q-vf'), question());
    await setDoc(
      doc(base, SEANCE),
      session({ verrouillee, questionIds: ['q-vf'], demarree: true, revelee: false }),
    );
    if (jordanPresent) await setDoc(doc(base, MARQUEUR), participant());
  });
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

/* ------------------------------------------------------------ la porte */

describe('La porte', () => {
  it('laisse entrer quand elle est ouverte', async () => {
    await semer({ verrouillee: false, jordanPresent: false });
    await assertSucceeds(
      setDoc(doc(connecte(env, JORDAN), MARQUEUR), participant({ rejointLe: HIER })),
    );
  });

  /* **Le cas qui donne son sens au champ.** Même code, même personne, même
     séance en cours : seule la porte a changé. */
  it('REFUS — entrer après le verrouillage', async () => {
    await semer({ verrouillee: true, jordanPresent: false });
    await assertFails(
      setDoc(doc(connecte(env, JORDAN), MARQUEUR), participant({ rejointLe: HIER })),
    );
  });

  /*
   * **Le verrou est réversible, et c'est la moitié de la fonctionnalité.** Un
   * retardataire légitime arrive toujours ; Noémie rouvre, il entre.
   */
  it('laisse Noémie rouvrir, et le retardataire entrer', async () => {
    await semer({ verrouillee: true, jordanPresent: false });

    await assertSucceeds(
      updateDoc(doc(connecte(env, NOEMIE), SEANCE), { verrouillee: false }),
    );
    await assertSucceeds(
      setDoc(doc(connecte(env, JORDAN), MARQUEUR), participant({ rejointLe: HIER })),
    );
  });

  it('REFUS — un commercial qui déverrouille lui-même', async () => {
    await semer({ verrouillee: true, jordanPresent: false });
    await assertFails(updateDoc(doc(connecte(env, JORDAN), SEANCE), { verrouillee: false }));
  });

  it('REFUS — une porte qui n’est pas un booléen', async () => {
    await semer({ verrouillee: false, jordanPresent: false });
    await assertFails(updateDoc(doc(connecte(env, NOEMIE), SEANCE), { verrouillee: 'oui' }));
  });
});

/* ------------------------------------- les séances composées avant ce champ */

/**
 * **Ce que rendre un champ obligatoire casse, et qu'il faut savoir nommer.**
 *
 * `verrouillee` entre dans `champsSession()`, lu avec `hasOnly` **et**
 * `hasAll`. Ces deux clauses portent sur l'état d'après fusion : un document
 * qui ne porte pas le champ ne se met donc plus à jour **du tout**, quel que
 * soit ce qu'on écrit. Ni lancer, ni mettre en pause, ni arrêter.
 *
 * C'est la politique écrite de `CLAUDE.md` — la base ne contient que de la
 * recette, on ne rend pas un champ facultatif pour ménager des documents
 * jetables. Mais la conséquence est visible à l'écran, et ces tests existent
 * pour qu'elle soit décrite plutôt que découverte : `scripts/completer-sessions.ts`
 * pose le champ manquant.
 */
describe('Une séance composée avant ce champ', () => {
  async function semerSansLeChamp() {
    await env.withSecurityRulesDisabled(async (contexte) => {
      const base = contexte.firestore();
      await setDoc(doc(base, 'questions/q-vf'), question());
      const ancienne = session({ questionIds: ['q-vf'] });
      delete (ancienne as Record<string, unknown>).verrouillee;
      await setDoc(doc(base, SEANCE), ancienne);
    });
  }

  it('REFUS — la mettre en pause', async () => {
    await semerSansLeChamp();
    await assertFails(updateDoc(doc(connecte(env, NOEMIE), SEANCE), { statut: 'pause' }));
  });

  it('REFUS — l’arrêter', async () => {
    await semerSansLeChamp();
    await assertFails(updateDoc(doc(connecte(env, NOEMIE), SEANCE), { statut: 'abandonnee' }));
  });

  /*
   * **La réparation tient en une écriture, et c'est ce qui la rend
   * proportionnée.** Poser le champ manquant suffit : le document redevient
   * conforme, et tout le reste remarche. C'est ce que fait
   * `scripts/completer-sessions.ts` — pas d'effacement, pas de recomposition.
   */
  it('se répare en posant le seul champ manquant', async () => {
    await semerSansLeChamp();
    await assertSucceeds(updateDoc(doc(connecte(env, NOEMIE), SEANCE), { verrouillee: false }));

    // Et la séance se pilote de nouveau, comme avant.
    await assertSucceeds(updateDoc(doc(connecte(env, NOEMIE), SEANCE), { statut: 'pause' }));
  });
});

/* ------------------------------------------- ceux qui sont déjà dans la salle */

/**
 * **Rien ne change pour eux.** Quatre gestes, porte fermée, sur quelqu'un qui
 * était entré avant : voter, corriger son nom, se relire, rester compté comme
 * présent.
 */
describe('Ceux qui sont déjà là', () => {
  it('votent encore, porte fermée', async () => {
    await semer({ verrouillee: true, jordanPresent: true });
    await assertSucceeds(
      setDoc(
        doc(connecte(env, JORDAN), `${SEANCE}/reponses/${JORDAN.uid}_q-vf`),
        reponseSession(JORDAN.uid, { questionId: 'q-vf', optionsChoisies: ['a'], correcte: true }),
      ),
    );
  });

  it('corrigent leur nom, porte fermée', async () => {
    await semer({ verrouillee: true, jordanPresent: true });
    await assertSucceeds(
      setDoc(doc(connecte(env, JORDAN), MARQUEUR), participant({ nom: 'Jordan D.' })),
    );
  });

  /*
   * **Une reconnexion n'est pas une arrivée.** Onglet rechargé, téléphone
   * reverrouillé : `rejoindre` fusionne sans réécrire `rejointLe`, et cette
   * mise à jour passe — même porte fermée. Écrire un nouvel horodatage la
   * ferait refuser, et l'écran annoncerait une panne à quelqu'un qui est dans
   * la pièce.
   */
  it('se reconnectent sans réécrire leur heure d’arrivée', async () => {
    await semer({ verrouillee: true, jordanPresent: true });
    await assertSucceeds(
      setDoc(
        doc(connecte(env, JORDAN), MARQUEUR),
        { nom: 'Jordan', avatar: 'rose', presence: 'visio' },
        { merge: true },
      ),
    );
  });

  it('REFUS — réécrire son heure d’arrivée', async () => {
    await semer({ verrouillee: true, jordanPresent: true });
    await assertFails(
      setDoc(doc(connecte(env, JORDAN), MARQUEUR), participant({ rejointLe: new Date() })),
    );
  });

  it('se relisent, porte fermée', async () => {
    await semer({ verrouillee: true, jordanPresent: true });
    await assertSucceeds(getDoc(doc(connecte(env, JORDAN), MARQUEUR)));
  });

  /* Et celle qui n'était pas là reste dehors : qu'un autre soit entré avant
     elle ne lui ouvre rien. */
  it('REFUS — celle qui n’était pas là reste dehors', async () => {
    await semer({ verrouillee: true, jordanPresent: true });
    await assertFails(
      setDoc(
        doc(connecte(env, SOPHIE), `${SEANCE}/participants/${SOPHIE.uid}`),
        participant({ nom: 'Sophie', rejointLe: HIER }),
      ),
    );
  });
});
