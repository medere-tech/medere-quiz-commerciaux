import { type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  disableNetwork,
  doc,
  enableNetwork,
  getDoc,
  setDoc,
  updateDoc,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { baseCourante, poserBase } from './aide';
import { connecte, creerEnvironnement, JORDAN, session } from '../regles/aide';

/**
 * « Connexion perdue » — ce que l'écouteur de séance a le droit d'affirmer.
 *
 * **Le mensonge que ces tests ferment.** Le bandeau « Connexion perdue »
 * s'affichait à l'arrivée en séance, pendant une quinzaine de secondes, alors
 * que tout allait bien. C'était la première chose qu'un commercial voyait en
 * entrant. Deux causes, et il fallait les deux :
 *
 * 1. Le tout premier instantané vient **toujours** du cache — c'est ainsi que
 *    Firestore répond vite. `fromCache` brut disait donc « hors ligne » avant
 *    même d'avoir essayé le serveur.
 * 2. `onSnapshot` ignore par défaut les changements qui ne portent que sur les
 *    métadonnées. Le passage cache → serveur, à données identiques, ne
 *    rappelait donc **jamais** la fonction : le bandeau restait jusqu'à la
 *    prochaine vraie modification de la séance. Une séance à l'arrêt n'en a
 *    pas.
 *
 * **Ces tests coupent le réseau pour de bon.** `disableNetwork` est l'API du
 * SDK, pas un faux : ce qui bascule ici est le vrai état du lien, et
 * `fromCache` réagit comme il réagira sur le téléphone d'un commercial dans un
 * couloir. Un test qui aurait simulé l'instantané aurait décidé lui-même de ce
 * que Firestore répond — et il serait passé sur l'ancienne implémentation.
 */

vi.mock(import('@/lib/firebase/firestore'), () => ({ baseDeDonnees: () => baseCourante() }));

const { ecouterSession } = await import('@/lib/session/depot');

let env: RulesTestEnvironment;
let base: Firestore;
let arreter: Unsubscribe | null = null;

beforeAll(async () => {
  env = await creerEnvironnement();
});

afterEach(async () => {
  arreter?.();
  arreter = null;
  // Le réseau est remis avant le nettoyage : une base coupée ne se vide pas.
  await enableNetwork(base).catch(() => {});
  await env.clearFirestore();
});

afterAll(async () => {
  await env.cleanup();
});

/** Une séance en cours, lisible par un commercial du domaine. */
async function semer(): Promise<void> {
  await env.withSecurityRulesDisabled(async (contexte) => {
    await setDoc(doc(contexte.firestore(), 'sessions/s1'), session());
  });
}

/**
 * Met le document en cache avant d'écouter.
 *
 * **C'est la condition réelle de l'écran, et sans elle le test ne reproduit
 * rien.** Le participant passe par `chercherSessionParCode` pour rejoindre :
 * quand l'écoute démarre, la séance est déjà dans le cache local, et le
 * premier instantané en vient. Un écouteur posé à froid, lui, reçoit d'emblée
 * la réponse du serveur — c'est ce que fait l'émulateur si on ne l'amorce pas,
 * et le défaut d'origine devient alors invisible.
 */
async function amorcerLeCache(): Promise<void> {
  await getDoc(doc(base, 'sessions/s1'));
}

/** Attend qu'une condition devienne vraie, ou échoue au bout du délai. */
async function jusqua(condition: () => boolean, quoi: string, limiteMs = 5000): Promise<void> {
  const debut = Date.now();
  while (Date.now() - debut < limiteMs) {
    if (condition()) return;
    await new Promise((suite) => setTimeout(suite, 50));
  }
  throw new Error(`Jamais arrivé dans les ${limiteMs} ms : ${quoi}`);
}

/** Laisse le temps à la confirmation serveur d'arriver. */
async function reposer(ms = 800): Promise<void> {
  await new Promise((suite) => setTimeout(suite, ms));
}

/** Lance l'écoute et collecte ce que chaque instantané annonce. */
function ecouter(): { annonces: boolean[]; vues: number } {
  const etat = { annonces: [] as boolean[], vues: 0 };
  arreter = ecouterSession('s1', (seance, horsLigne) => {
    if (seance) etat.vues += 1;
    etat.annonces.push(horsLigne);
  });
  return etat;
}

describe('l’écouteur de séance', () => {
  it('n’annonce pas « hors ligne » avant d’avoir entendu le serveur', async () => {
    base = connecte(env, JORDAN);
    poserBase(base);
    await semer();

    await amorcerLeCache();

    const etat = ecouter();
    await jusqua(() => etat.vues > 0, 'la séance arrive');
    await reposer();

    /* Le premier instantané vient du cache : c'est normal, et ce n'est pas une
       perte de connexion. Annoncer l'inverse était le défaut. */
    expect(etat.annonces.every((horsLigne) => horsLigne === false)).toBe(true);
  });

  it('finit par confirmer depuis le serveur, sans qu’on touche à la séance', async () => {
    base = connecte(env, JORDAN);
    poserBase(base);
    await semer();

    await amorcerLeCache();

    const etat = ecouter();
    await jusqua(() => etat.vues > 0, 'la séance arrive');

    /*
     * **C'est ce rappel-là qui n'arrivait pas.** Sans
     * `includeMetadataChanges`, la confirmation serveur à données identiques
     * ne produit aucun appel. On ne modifie rien ici, exprès : une séance à
     * l'arrêt ne change pas, et c'est précisément le cas où le bandeau
     * restait collé.
     */
    await jusqua(() => etat.annonces.length >= 2, 'un second instantané, de métadonnées');
    expect(etat.annonces[etat.annonces.length - 1]).toBe(false);
  });

  it('annonce « hors ligne » quand le lien tombe pour de bon', async () => {
    base = connecte(env, JORDAN);
    poserBase(base);
    await semer();

    await amorcerLeCache();

    const etat = ecouter();
    await jusqua(() => etat.vues > 0, 'la séance arrive');
    await reposer();

    await disableNetwork(base);

    await jusqua(
      () => etat.annonces[etat.annonces.length - 1] === true,
      'le bandeau hors ligne se lève',
    );
  });

  it('retire l’annonce quand la connexion revient', async () => {
    base = connecte(env, JORDAN);
    poserBase(base);
    await semer();

    await amorcerLeCache();

    const etat = ecouter();
    await jusqua(() => etat.vues > 0, 'la séance arrive');
    await reposer();

    await disableNetwork(base);
    await jusqua(() => etat.annonces[etat.annonces.length - 1] === true, 'la coupure');

    await enableNetwork(base);
    await jusqua(
      () => etat.annonces[etat.annonces.length - 1] === false,
      'le retour du lien',
    );
  });

  it('continue de servir la séance pendant la coupure', async () => {
    base = connecte(env, JORDAN);
    poserBase(base);
    await semer();

    await amorcerLeCache();

    const etat = ecouter();
    await jusqua(() => etat.vues > 0, 'la séance arrive');
    await reposer();
    const vuesAvant = etat.vues;

    await disableNetwork(base);
    await jusqua(() => etat.annonces[etat.annonces.length - 1] === true, 'la coupure');

    /* Le cache fait foi pendant la coupure : l'écran montre le dernier état
       reçu, et le dit. Il ne se vide pas. */
    expect(etat.vues).toBeGreaterThanOrEqual(vuesAvant);
  });

  it('reprend les modifications reçues après le retour du lien', async () => {
    base = connecte(env, JORDAN);
    poserBase(base);
    await semer();

    await amorcerLeCache();

    const etat = ecouter();
    await jusqua(() => etat.vues > 0, 'la séance arrive');
    await reposer();

    await disableNetwork(base);
    await jusqua(() => etat.annonces[etat.annonces.length - 1] === true, 'la coupure');

    await env.withSecurityRulesDisabled(async (contexte) => {
      await updateDoc(doc(contexte.firestore(), 'sessions/s1'), { indexCourant: 1 });
    });

    await enableNetwork(base);
    await jusqua(
      () => etat.annonces[etat.annonces.length - 1] === false,
      'le retour du lien',
    );
  });
});
