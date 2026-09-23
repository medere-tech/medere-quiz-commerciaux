import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest';

import {
  appel,
  connecte,
  creerEnvironnement,
  EXTERNE,
  JORDAN,
  NOEMIE,
  participant,
  session,
  SOPHIE,
} from './aide';

/**
 * Frapper à la porte — le seul canal qui remonte de la salle.
 *
 * **Ce que ces règles gardent, et pourquoi c'est nouveau.** Tout le reste de
 * la séance descend : la question, la révélation, le classement. Un
 * participant n'écrit que ce qui le concerne *à l'intérieur* — sa présence, sa
 * réponse. Ici, quelqu'un qui n'est pas dans la pièce adresse une demande à
 * l'animatrice. C'est la première écriture de l'outil qui vient de dehors.
 *
 * **La clause la plus importante n'est pas celle qui autorise, c'est celle qui
 * ferme la lecture.** Un appel nomme quelqu'un qui est resté dehors. Les
 * présences, elles, sont lisibles par toute la salle — l'écran projeté les
 * affiche déjà, la liste ne dit rien que la pièce ne voie. Un appel dit
 * l'inverse, et il ne regarde que l'animatrice.
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

/** Une séance en cours, porte fermée par défaut. */
async function semer(remplacements: Record<string, unknown> = {}): Promise<void> {
  await env.withSecurityRulesDisabled(async (contexte) => {
    await setDoc(
      doc(contexte.firestore(), 'sessions/s1'),
      session({ statut: 'encours', verrouillee: true, ...remplacements }),
    );
  });
}

/** Pose un appel sans passer par les règles, pour éprouver la lecture. */
async function poserAppel(uid = JORDAN.uid): Promise<void> {
  await env.withSecurityRulesDisabled(async (contexte) => {
    await setDoc(doc(contexte.firestore(), `sessions/s1/appels/${uid}`), appel());
  });
}

/** Fait entrer quelqu'un dans la salle. */
async function faireEntrer(uid = JORDAN.uid): Promise<void> {
  await env.withSecurityRulesDisabled(async (contexte) => {
    await setDoc(doc(contexte.firestore(), `sessions/s1/participants/${uid}`), participant());
  });
}

describe('frapper à la porte', () => {
  it('un commercial du domaine frappe à une porte fermée', async () => {
    await semer();

    await assertSucceeds(
      setDoc(doc(connecte(env, JORDAN), `sessions/s1/appels/${JORDAN.uid}`), appel()),
    );
  });

  /*
   * **Frapper deux fois écrit le même document.** C'est ce qui fait qu'une
   * insistance ne produit pas une file : le rappel d'une minute repousse
   * `demandeLe`, il n'ajoute pas de ligne à l'écran de l'animatrice.
   */
  it('le rappel réécrit le même document', async () => {
    await semer();
    const client = connecte(env, JORDAN);

    await assertSucceeds(setDoc(doc(client, `sessions/s1/appels/${JORDAN.uid}`), appel()));
    await assertSucceeds(
      setDoc(doc(client, `sessions/s1/appels/${JORDAN.uid}`), appel({ nom: 'Jordan D.' })),
    );
  });

  it('REFUS — on ne frappe pas à une porte ouverte', async () => {
    await semer({ verrouillee: false });

    /* Tant que la salle accepte, « Rejoindre » est le bon geste. Un appel
       serait du bruit sur l'écran de l'animatrice. */
    await assertFails(
      setDoc(doc(connecte(env, JORDAN), `sessions/s1/appels/${JORDAN.uid}`), appel()),
    );
  });

  it('REFUS — on ne frappe pas à une séance terminée', async () => {
    await semer({ statut: 'terminee' });

    await assertFails(
      setDoc(doc(connecte(env, JORDAN), `sessions/s1/appels/${JORDAN.uid}`), appel()),
    );
  });

  it('on frappe pendant une pause : la porte peut être fermée aussi', async () => {
    await semer({ statut: 'pause' });

    await assertSucceeds(
      setDoc(doc(connecte(env, JORDAN), `sessions/s1/appels/${JORDAN.uid}`), appel()),
    );
  });

  /*
   * **La porte se ferme aussi dans l'autre sens.** Qui est entré n'a plus rien
   * à demander, et un appel laissé là ferait apparaître dans la liste
   * quelqu'un qui est assis dans la salle.
   */
  it('REFUS — un présent ne frappe pas', async () => {
    await semer();
    await faireEntrer();

    await assertFails(
      setDoc(doc(connecte(env, JORDAN), `sessions/s1/appels/${JORDAN.uid}`), appel()),
    );
  });

  it('REFUS — on ne frappe pas au nom de quelqu’un d’autre', async () => {
    await semer();

    await assertFails(
      setDoc(doc(connecte(env, JORDAN), `sessions/s1/appels/${SOPHIE.uid}`), appel()),
    );
  });

  it('REFUS — une adresse hors domaine ne frappe pas', async () => {
    await semer();

    await assertFails(
      setDoc(doc(connecte(env, EXTERNE), `sessions/s1/appels/${EXTERNE.uid}`), appel()),
    );
  });

  it('REFUS — un champ de plus, et l’appel est refusé', async () => {
    await semer();

    await assertFails(
      setDoc(
        doc(connecte(env, JORDAN), `sessions/s1/appels/${JORDAN.uid}`),
        appel({ message: 'ouvrez-moi' }),
      ),
    );
  });

  it('REFUS — un nom hors borne', async () => {
    await semer();

    await assertFails(
      setDoc(
        doc(connecte(env, JORDAN), `sessions/s1/appels/${JORDAN.uid}`),
        appel({ nom: 'x'.repeat(33) }),
      ),
    );
  });

  it('REFUS — une couleur hors palette', async () => {
    await semer();

    await assertFails(
      setDoc(
        doc(connecte(env, JORDAN), `sessions/s1/appels/${JORDAN.uid}`),
        appel({ avatar: 'fuchsia' }),
      ),
    );
  });
});

describe('qui lit les appels', () => {
  it('l’animatrice lit toute la liste', async () => {
    await semer();
    await poserAppel();

    await assertSucceeds(getDocs(collection(connecte(env, NOEMIE), 'sessions/s1/appels')));
  });

  /*
   * **La clause qui rend la fonctionnalité acceptable.** Un appel nomme
   * quelqu'un qui est resté dehors : personne, dans la salle, n'a à
   * l'apprendre. C'est la différence assumée avec les présences, dont la liste
   * s'ouvre au domaine parce que l'écran projeté les montre déjà.
   */
  it('REFUS — un commercial ne lit pas la liste des appels', async () => {
    await semer();
    await poserAppel();

    await assertFails(getDocs(collection(connecte(env, SOPHIE), 'sessions/s1/appels')));
  });

  it('chacun relit le sien : c’est ce qui évite de frapper vingt fois', async () => {
    await semer();
    await poserAppel();

    await assertSucceeds(getDoc(doc(connecte(env, JORDAN), `sessions/s1/appels/${JORDAN.uid}`)));
  });

  it('REFUS — personne ne lit l’appel de quelqu’un d’autre', async () => {
    await semer();
    await poserAppel();

    await assertFails(getDoc(doc(connecte(env, SOPHIE), `sessions/s1/appels/${JORDAN.uid}`)));
  });
});

describe('effacer un appel', () => {
  it('l’animatrice écarte un appel', async () => {
    await semer();
    await poserAppel();

    await assertSucceeds(
      deleteDoc(doc(connecte(env, NOEMIE), `sessions/s1/appels/${JORDAN.uid}`)),
    );
  });

  /* Entrer efface son propre appel : rien ne s'archive, et la liste de
     l'animatrice ne garde pas quelqu'un qui est déjà assis. */
  it('l’appelant retire le sien', async () => {
    await semer();
    await poserAppel();

    await assertSucceeds(
      deleteDoc(doc(connecte(env, JORDAN), `sessions/s1/appels/${JORDAN.uid}`)),
    );
  });

  it('REFUS — personne n’efface l’appel d’un autre', async () => {
    await semer();
    await poserAppel();

    await assertFails(deleteDoc(doc(connecte(env, SOPHIE), `sessions/s1/appels/${JORDAN.uid}`)));
  });
});
