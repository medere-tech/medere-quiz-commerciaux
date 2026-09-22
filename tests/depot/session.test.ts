import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { baseCourante, poserBase } from './aide';
import {
  connecte,
  creerEnvironnement,
  HIER,
  JORDAN,
  NOEMIE,
  question,
  session,
  SOPHIE,
  utilisateur,
} from '../regles/aide';

/**
 * Ce que le dépôt de session écrit réellement.
 *
 * **Le trou que ces tests ferment.** Les tests de règles répondent à une seule
 * question : *l'animatrice a-t-elle le droit d'écrire ceci ?* Aucun ne
 * répondait à l'autre : *quand elle appuie sur le bouton, qu'est-ce que le
 * dépôt écrit ?* Un champ que les règles permettent sans l'exiger —
 * `questionOuverteLe` en était un — pouvait donc disparaître d'une écriture
 * sans qu'aucun test ne bouge. C'est arrivé, et ça s'est vu un jeudi, devant
 * la salle.
 *
 * **Les règles s'appliquent pendant ces tests, et c'est le point.** La base
 * injectée est celle de `@firebase/rules-unit-testing`, avec le jeu de règles
 * du dépôt et les claims de l'identité choisie. Un dépôt qui écrirait une
 * charge refusée échoue ici, sur-le-champ : c'est strictement plus fort qu'un
 * test unitaire sur une base factice, qui accepterait n'importe quoi.
 *
 * **Ce qu'ils ne couvrent pas.** Les Cloud Functions ne tournent pas :
 * `bilan`, `classement` et `prix` restent hors de portée. C'est un cadrage à
 * part, noté aux candidats du lot 8.
 */

vi.mock(import('@/lib/firebase/firestore'), () => ({ baseDeDonnees: () => baseCourante() }));

const {
  abandonner,
  chargerMaReponse,
  chercherSessionParCode,
  creerSession,
  lancerSeance,
  mettreEnPause,
  questionSuivante,
  rejoindre,
  repondreEnSession,
  reprendre,
  revelerReponse,
  rouvrirLeVote,
  terminerSession,
} = await import('@/lib/session/depot');

const AUTRE_ADMIN = { uid: 'uid-autre-admin', email: 'admin2@medere.fr', admin: true };

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

/** L'état de départ : une séance en cours, deux questions publiées, deux comptes. */
async function semer(remplacements: Record<string, unknown> = {}): Promise<void> {
  await env.withSecurityRulesDisabled(async (contexte) => {
    const base = contexte.firestore();
    await setDoc(doc(base, 'questions/q-vf'), question());
    await setDoc(doc(base, 'questions/q-qcm'), question({ enonce: 'Seconde question.' }));
    await setDoc(
      doc(base, 'sessions/s1'),
      session({ questionIds: ['q-vf', 'q-qcm'], ...remplacements }),
    );
    await setDoc(doc(base, `users/${JORDAN.uid}`), utilisateur());
    await setDoc(
      doc(base, `users/${SOPHIE.uid}`),
      utilisateur({ email: SOPHIE.email, nom: 'Sophie', nomSession: 'Sophie' }),
    );
  });
}

/** Relit sans passer par les règles : on vérifie ce qui est écrit, pas ce qui est lisible. */
async function relire(chemin: string): Promise<Record<string, unknown> | null> {
  let donnees: Record<string, unknown> | null = null;
  await env.withSecurityRulesDisabled(async (contexte) => {
    const instantane = await getDoc(doc(contexte.firestore(), chemin));
    donnees = instantane.exists() ? (instantane.data() as Record<string, unknown>) : null;
  });
  return donnees;
}

async function compter(chemin: string): Promise<number> {
  let total = 0;
  await env.withSecurityRulesDisabled(async (contexte) => {
    total = (await getDocs(collection(contexte.firestore(), chemin))).size;
  });
  return total;
}

async function premier(chemin: string): Promise<Record<string, unknown> | null> {
  let donnees: Record<string, unknown> | null = null;
  await env.withSecurityRulesDisabled(async (contexte) => {
    const lot = await getDocs(collection(contexte.firestore(), chemin));
    donnees = (lot.docs[0]?.data() as Record<string, unknown>) ?? null;
  });
  return donnees;
}

function millisecondes(valeur: unknown): number | null {
  if (valeur && typeof valeur === 'object' && 'toMillis' in valeur) {
    return (valeur as { toMillis: () => number }).toMillis();
  }
  return null;
}

/* -------------------------------------------------------- repondreEnSession */

/**
 * **La fonction où une erreur fausse le score sans que personne ne le voie.**
 *
 * Trois documents : la réponse de séance, qui fait le classement ; la réponse
 * personnelle, qui fait la progression ; l'état de la question, qui la ramène
 * dans « à revoir ». Un seul lot. Si l'un des trois manquait sans que les deux
 * autres tombent, on aurait un classement juste et un historique faux — ou
 * l'inverse —, et rien à l'écran pour le signaler.
 */
describe('repondreEnSession', () => {
  beforeEach(async () => {
    await semer();
    poserBase(connecte(env, JORDAN));
  });

  it('écrit les trois documents', async () => {
    await assertSucceeds(repondreEnSession('s1', JORDAN.uid, 'q-vf', ['a'], true));

    const enSeance = await relire(`sessions/s1/reponses/${JORDAN.uid}_q-vf`);
    expect(enSeance).toMatchObject({
      uid: JORDAN.uid,
      questionId: 'q-vf',
      optionsChoisies: ['a'],
      correcte: true,
    });
    expect(millisecondes(enSeance?.repondueLe)).toBeTypeOf('number');

    expect(await compter(`users/${JORDAN.uid}/reponses`)).toBe(1);
    expect(await premier(`users/${JORDAN.uid}/reponses`)).toMatchObject({
      questionId: 'q-vf',
      correcte: true,
      optionsChoisies: ['a'],
      // Ce qui distingue une réponse de séance d'une réponse d'entraînement
      // dans la progression : sans elle, on ne saurait plus d'où elle vient.
      origine: 'session',
    });

    expect(await relire(`users/${JORDAN.uid}/etats/q-vf`)).toMatchObject({
      reussies: 1,
      tentatives: 1,
      derniereRatee: false,
    });
  });

  it('une réponse fausse compte une tentative et marque la question à revoir', async () => {
    await assertSucceeds(repondreEnSession('s1', JORDAN.uid, 'q-vf', ['b'], false));

    expect(await relire(`users/${JORDAN.uid}/etats/q-vf`)).toMatchObject({
      reussies: 0,
      tentatives: 1,
      derniereRatee: true,
    });
  });

  it("l'échec d'un document annule les deux autres — vote après révélation", async () => {
    await env.withSecurityRulesDisabled(async (contexte) => {
      await setDoc(doc(contexte.firestore(), 'sessions/s1'), session({ revelee: true }));
    });

    // Les règles refusent la réponse de séance : la bonne réponse est affichée.
    // Les deux écritures personnelles, elles, seraient acceptées isolément.
    await assertFails(repondreEnSession('s1', JORDAN.uid, 'q-vf', ['a'], true));

    expect(await relire(`sessions/s1/reponses/${JORDAN.uid}_q-vf`)).toBeNull();
    expect(await compter(`users/${JORDAN.uid}/reponses`)).toBe(0);
    expect(await relire(`users/${JORDAN.uid}/etats/q-vf`)).toBeNull();
  });

  it("l'échec d'un document annule les deux autres — verdict mensonger", async () => {
    // Le client annonce « correcte » sur une option fausse. Ce qu'on vérifie
    // ici est qu'il n'en reste rien nulle part, pas même une tentative dans la
    // progression : une tentative fantôme fausserait la maîtrise sans que rien
    // ne la signale.
    await assertFails(repondreEnSession('s1', JORDAN.uid, 'q-vf', ['b'], true));

    expect(await relire(`sessions/s1/reponses/${JORDAN.uid}_q-vf`)).toBeNull();
    expect(await compter(`users/${JORDAN.uid}/reponses`)).toBe(0);
    expect(await relire(`users/${JORDAN.uid}/etats/q-vf`)).toBeNull();
  });

  it('REFUS — répondre deux fois à la même question', async () => {
    await assertSucceeds(repondreEnSession('s1', JORDAN.uid, 'q-vf', ['b'], false));
    await assertFails(repondreEnSession('s1', JORDAN.uid, 'q-vf', ['a'], true));

    // Et la seconde tentative n'a rien ajouté à la progression non plus.
    expect(await compter(`users/${JORDAN.uid}/reponses`)).toBe(1);
    expect(await relire(`users/${JORDAN.uid}/etats/q-vf`)).toMatchObject({ tentatives: 1 });
  });

  it('deux participants répondent chacun pour soi', async () => {
    await assertSucceeds(repondreEnSession('s1', JORDAN.uid, 'q-vf', ['a'], true));
    poserBase(connecte(env, SOPHIE));
    await assertSucceeds(repondreEnSession('s1', SOPHIE.uid, 'q-vf', ['b'], false));

    expect(await compter('sessions/s1/reponses')).toBe(2);
    expect(await compter(`users/${JORDAN.uid}/reponses`)).toBe(1);
    expect(await compter(`users/${SOPHIE.uid}/reponses`)).toBe(1);
  });
});

/* --------------------------------------------- les écritures d'état de séance */

describe('la conduite de la séance', () => {
  beforeEach(() => {
    poserBase(connecte(env, NOEMIE));
  });

  it('revelerReponse pose la répartition et le nombre de répondants', async () => {
    await semer();
    await assertSucceeds(revelerReponse('s1', [3, 1], 4));

    expect(await relire('sessions/s1')).toMatchObject({
      revelee: true,
      repartition: [3, 1],
      repondants: 4,
    });
  });

  it('rouvrirLeVote rouvre, vide la répartition et repose le chronomètre', async () => {
    await semer({ revelee: true, repartition: [3, 1], repondants: 4 });
    await assertSucceeds(rouvrirLeVote('s1'));

    const apres = await relire('sessions/s1');
    expect(apres).toMatchObject({ revelee: false, repartition: [] });
    // Le défaut trouvé en séance réelle : sans échéance neuve, la salle
    // retrouvait sa question sur un chronomètre déjà écoulé.
    expect(millisecondes(apres?.questionOuverteLe)).toBeGreaterThan(HIER.getTime());
  });

  it('questionSuivante avance, remet les compteurs à zéro et repose le chronomètre', async () => {
    await semer({ revelee: true, repartition: [3, 1], repondants: 4 });
    await assertSucceeds(questionSuivante('s1', 1));

    const apres = await relire('sessions/s1');
    expect(apres).toMatchObject({
      indexCourant: 1,
      revelee: false,
      repartition: [],
      repondants: 0,
    });
    expect(millisecondes(apres?.questionOuverteLe)).toBeGreaterThan(HIER.getTime());
  });

  it('mettreEnPause ferme le vote sans toucher au reste', async () => {
    await semer({ indexCourant: 1 });
    await assertSucceeds(mettreEnPause('s1'));

    const apres = await relire('sessions/s1');
    expect(apres).toMatchObject({ statut: 'pause', indexCourant: 1 });
    // La pause ne fait pas repartir la question : on reprend où l'on en était.
    expect(millisecondes(apres?.questionOuverteLe)).toBe(HIER.getTime());
  });

  it('reprendre repose le chronomètre en entier', async () => {
    await semer({ statut: 'pause' });
    await assertSucceeds(reprendre('s1'));

    const apres = await relire('sessions/s1');
    expect(apres).toMatchObject({ statut: 'encours' });
    // Une pause de dix minutes laisserait sinon la salle reprendre sur une
    // échéance dépassée, et la question rouvrirait sur « temps écoulé ».
    expect(millisecondes(apres?.questionOuverteLe)).toBeGreaterThan(HIER.getTime());
  });

  it('terminerSession clôt et ferme le vote', async () => {
    await semer();
    await assertSucceeds(terminerSession('s1'));

    // C'est ce passage à `terminee` que la Cloud Function attend pour classer.
    expect(await relire('sessions/s1')).toMatchObject({ statut: 'terminee', revelee: true });
  });

  it('abandonner clôt sans classer', async () => {
    await semer();
    await assertSucceeds(abandonner('s1'));

    expect(await relire('sessions/s1')).toMatchObject({ statut: 'abandonnee' });
  });

  it('lancerSeance ouvre une séance préparée et part maintenant', async () => {
    await semer({ statut: 'attente' });
    await assertSucceeds(lancerSeance('s1'));

    const apres = await relire('sessions/s1');
    expect(apres).toMatchObject({ statut: 'encours' });
    // Le chronomètre part au lancement, pas à la composition : une séance
    // préparée le mardi ne s'ouvre pas le jeudi sur une échéance de mardi.
    expect(millisecondes(apres?.questionOuverteLe)).toBeGreaterThan(HIER.getTime());
  });

  it("REFUS — une animatrice conduit la séance d'une autre", async () => {
    await semer();
    poserBase(connecte(env, AUTRE_ADMIN));

    await assertFails(questionSuivante('s1', 1));
    await assertFails(terminerSession('s1'));
  });

  it('REFUS — un commercial conduit la séance', async () => {
    await semer();
    poserBase(connecte(env, JORDAN));

    await assertFails(revelerReponse('s1', [3, 1], 4));
    await assertFails(rouvrirLeVote('s1'));
  });
});

/* ------------------------------------------------------------- creerSession */

describe('creerSession', () => {
  beforeEach(() => {
    poserBase(connecte(env, NOEMIE));
  });

  /**
   * Ce que la séance annonce d'elle-même.
   *
   * Le titre et le nom de l'animatrice sont obligatoires côté règles : une
   * séance anonyme s'afficherait sans nom sur un écran projeté. La description
   * reste facultative.
   */
  const ANNONCE = {
    titre: 'Objections sur les classes virtuelles',
    description: 'Les quatre questions les plus ratées du mois.',
    animateurNom: 'Noémie',
  };

  it('écrit une séance complète, ouverte, avec un code lisible', async () => {
    const id = await creerSession(NOEMIE.uid, ['q-vf', 'q-qcm'], 45, 'encours', ANNONCE);

    const seance = await relire(`sessions/${id}`);
    expect(seance).toMatchObject({
      titre: 'Objections sur les classes virtuelles',
      description: 'Les quatre questions les plus ratées du mois.',
      animateurNom: 'Noémie',
      questionIds: ['q-vf', 'q-qcm'],
      indexCourant: 0,
      revelee: false,
      statut: 'encours',
      animateurUid: NOEMIE.uid,
      repartition: [],
      repondants: 0,
      dureeQuestionSecondes: 45,
    });
    expect(millisecondes(seance?.questionOuverteLe)).toBeTypeOf('number');
    // Ouverte d'emblée : l'heure d'ouverture est posée.
    expect(millisecondes(seance?.ouverteLe)).toBeTypeOf('number');
    // Ni O ni 0, ni I ni 1 : le code est lu à voix haute puis saisi à la main.
    expect(seance?.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });

  /*
   * **Une séance préparée n'a pas encore d'heure d'ouverture.** C'est ce qui
   * distingue `ouverteLe` de `creeeLe` : composée le mardi, lancée le jeudi.
   * `lancerSeance` posera la seconde date.
   */
  it('écrit une séance préparée, qui ne se rejoint pas encore', async () => {
    const id = await creerSession(NOEMIE.uid, ['q-vf'], 0, 'attente', ANNONCE);

    const seance = await relire(`sessions/${id}`);
    expect(seance).toMatchObject({ statut: 'attente', ouverteLe: null });
  });

  it('nettoie le titre collé depuis un tableur plutôt que de se faire refuser', async () => {
    const id = await creerSession(NOEMIE.uid, ['q-vf'], 45, 'encours', {
      ...ANNONCE,
      titre: '  Objections\tsur les classes  ',
    });

    expect(await relire(`sessions/${id}`)).toMatchObject({
      titre: 'Objectionssur les classes',
    });
  });

  it('REFUS — une séance sans titre : elle s’afficherait sans nom', async () => {
    await assertFails(
      creerSession(NOEMIE.uid, ['q-vf'], 45, 'encours', { ...ANNONCE, titre: '' }),
    );
  });

  it("REFUS — créer une séance au nom d'une autre animatrice", async () => {
    await assertFails(creerSession(AUTRE_ADMIN.uid, ['q-vf'], 45, 'encours', ANNONCE));
  });

  it('REFUS — un commercial crée une séance', async () => {
    poserBase(connecte(env, JORDAN));
    await assertFails(creerSession(JORDAN.uid, ['q-vf'], 45, 'encours', ANNONCE));
  });
});

/* ---------------------------------------------------------------- rejoindre */

describe('rejoindre', () => {
  beforeEach(async () => {
    await semer();
    poserBase(connecte(env, JORDAN));
  });

  it('pose le marqueur de présence et mémorise le nom pour la prochaine fois', async () => {
    await assertSucceeds(rejoindre('s1', JORDAN.uid, '  Jordan B.  ', 'orange', 'visio'));

    // Le marqueur porte le nom et la teinte : l'animatrice dessine la salle
    // sans lire les données privées de personne.
    expect(await relire(`sessions/s1/participants/${JORDAN.uid}`)).toMatchObject({
      nom: 'Jordan B.',
      avatar: 'orange',
      // La séance est hybride : le lieu est déclaré par son porteur.
      presence: 'visio',
    });
    expect(await relire(`users/${JORDAN.uid}`)).toMatchObject({
      nomSession: 'Jordan B.',
      avatar: 'orange',
      presence: 'visio',
    });
  });

  it("l'échec d'un document annule l'autre — séance close", async () => {
    await env.withSecurityRulesDisabled(async (contexte) => {
      await setDoc(doc(contexte.firestore(), 'sessions/s1'), session({ statut: 'terminee' }));
    });

    await assertFails(rejoindre('s1', JORDAN.uid, 'Jordan B.', 'orange', 'salle'));

    expect(await relire(`sessions/s1/participants/${JORDAN.uid}`)).toBeNull();
    // Le nom mémorisé ne bouge pas non plus : le lot est indivisible.
    expect(await relire(`users/${JORDAN.uid}`)).toMatchObject({ nomSession: 'Jordan' });
  });

  it('REFUS — se déclarer présent sous un autre uid', async () => {
    await assertFails(rejoindre('s1', SOPHIE.uid, 'Sophie', 'violet', 'salle'));
  });

  it('REFUS — une teinte hors palette', async () => {
    await assertFails(rejoindre('s1', JORDAN.uid, 'Jordan B.', 'fuchsia', 'salle'));
  });

  /*
   * **Revenir n'est pas arriver.** Onglet rechargé, téléphone reverrouillé :
   * on repasse par l'écran d'accès, et le marqueur existe déjà. Les règles
   * refusent de faire bouger `rejointLe` — c'est ce qui empêche quiconque de
   * réécrire son heure d'arrivée —, si bien qu'écrire l'horodatage à chaque
   * passage faisait de la reconnexion un refus de permission. L'écran
   * annonçait « la recherche n'a pas abouti » à quelqu'un qui était dans la
   * pièce.
   */
  it('laisse revenir sans réécrire l’heure d’arrivée', async () => {
    await assertSucceeds(rejoindre('s1', JORDAN.uid, 'Jordan B.', 'orange', 'salle'));
    const premiere = (await relire(`sessions/s1/participants/${JORDAN.uid}`))?.rejointLe;

    await assertSucceeds(rejoindre('s1', JORDAN.uid, 'Jordan B.', 'rose', 'visio'));

    const apres = await relire(`sessions/s1/participants/${JORDAN.uid}`);
    expect(apres).toMatchObject({ avatar: 'rose', presence: 'visio' });
    expect(apres?.rejointLe).toStrictEqual(premiere);
  });

  /* Le verrou ferme la porte aux nouveaux venus, et à eux seuls. */
  it('REFUS — entrer quand l’accès est verrouillé', async () => {
    await env.withSecurityRulesDisabled(async (contexte) => {
      await setDoc(doc(contexte.firestore(), 'sessions/s1'), session({ verrouillee: true }));
    });

    await assertFails(rejoindre('s1', JORDAN.uid, 'Jordan B.', 'orange', 'salle'));
    expect(await relire(`sessions/s1/participants/${JORDAN.uid}`)).toBeNull();
  });

  it('laisse revenir un présent même quand l’accès est verrouillé', async () => {
    await assertSucceeds(rejoindre('s1', JORDAN.uid, 'Jordan B.', 'orange', 'salle'));

    await env.withSecurityRulesDisabled(async (contexte) => {
      await setDoc(doc(contexte.firestore(), 'sessions/s1'), session({ verrouillee: true }));
    });

    await assertSucceeds(rejoindre('s1', JORDAN.uid, 'Jordan B.', 'orange', 'visio'));
    expect(await relire(`sessions/s1/participants/${JORDAN.uid}`)).toMatchObject({
      presence: 'visio',
    });
  });
});

/* --------------------------------------------------------------- les lectures */

describe('chercherSessionParCode', () => {
  beforeEach(async () => {
    await semer();
    poserBase(connecte(env, JORDAN));
  });

  it('trouve la séance en cours', async () => {
    const trouvee = await chercherSessionParCode('JEUDI7');

    expect(trouvee?.id).toBe('s1');
    expect(trouvee?.questionIds).toEqual(['q-vf', 'q-qcm']);
  });

  it('tolère les espaces d’une saisie à la main', async () => {
    expect((await chercherSessionParCode('  JEUDI7 '))?.id).toBe('s1');
  });

  it('ne trouve rien sur un code inconnu', async () => {
    expect(await chercherSessionParCode('ZZZZZZ')).toBeNull();
  });

  it('ignore une séance close et garde celle qui est ouverte', async () => {
    await env.withSecurityRulesDisabled(async (contexte) => {
      const base = contexte.firestore();
      await setDoc(doc(base, 'sessions/s1'), session({ statut: 'terminee' }));
      await setDoc(doc(base, 'sessions/s2'), session({ statut: 'encours' }));
    });

    // Le même code a resservi : c'est la séance ouverte qui gagne.
    expect((await chercherSessionParCode('JEUDI7'))?.id).toBe('s2');
  });

  it('ne rend rien quand toutes les séances de ce code sont closes', async () => {
    await env.withSecurityRulesDisabled(async (contexte) => {
      await setDoc(doc(contexte.firestore(), 'sessions/s1'), session({ statut: 'abandonnee' }));
    });

    expect(await chercherSessionParCode('JEUDI7')).toBeNull();
  });
});

describe('chargerMaReponse', () => {
  beforeEach(async () => {
    await semer();
    poserBase(connecte(env, JORDAN));
  });

  it('rend la sélection après un rechargement de page', async () => {
    await repondreEnSession('s1', JORDAN.uid, 'q-vf', ['b'], false);

    // Ce que voit quelqu'un qui recharge : sa réponse, et un bouton éteint.
    // Sans cela il retrouvait un écran vierge et un « Envoyer » actif, que les
    // règles auraient refusé sans qu'il comprenne pourquoi.
    expect(await chargerMaReponse('s1', JORDAN.uid, 'q-vf')).toEqual(['b']);
  });

  it('rend null quand on n’a pas encore répondu', async () => {
    expect(await chargerMaReponse('s1', JORDAN.uid, 'q-vf')).toBeNull();
  });

  it('rend null sur une autre question de la séance', async () => {
    await repondreEnSession('s1', JORDAN.uid, 'q-vf', ['b'], false);

    expect(await chargerMaReponse('s1', JORDAN.uid, 'q-qcm')).toBeNull();
  });

  it('REFUS — lire la réponse de quelqu’un d’autre', async () => {
    poserBase(connecte(env, SOPHIE));
    await repondreEnSession('s1', SOPHIE.uid, 'q-vf', ['a'], true);

    poserBase(connecte(env, JORDAN));
    await assertFails(chargerMaReponse('s1', SOPHIE.uid, 'q-vf'));
  });
});
