import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

/**
 * Les trois Cloud Functions, exercées de bout en bout.
 *
 * **Ce que ces tests couvrent, et que rien ne couvrait.** Le calcul est déjà
 * testé — `classer`, `bilanDesReponses`, `doitCompter`, `agreger` ont leurs
 * fichiers. Ce qui manquait est ce qu'il y a autour : **le déclenchement** et
 * **l'écriture**. Un chemin de déclencheur mal écrit, un champ oublié dans le
 * document produit, une condition de passage inversée — rien de tout cela
 * n'apparaît dans un test de fonction pure, et rien ne l'aurait signalé avant
 * le jeudi matin. Le bilan, en particulier, n'avait jamais tourné une seule
 * fois, ni en local ni en production.
 *
 * On n'appelle donc pas les fonctions : **on écrit dans Firestore et on attend
 * ce qui doit en sortir**, exactement comme en production. L'émulateur
 * `functions` charge le module compilé et enregistre les vrais déclencheurs ;
 * l'émulateur `auth` sert les custom claims que lit l'agrégation.
 *
 * **Lenteur assumée, et pourquoi.** Le premier déclenchement paie un démarrage
 * à froid de plusieurs secondes — treize, mesurées ici. Les attentes sont donc
 * larges, et `beforeAll` réchauffe chaque fonction avant que le premier test ne
 * s'exécute. Une attente courte ferait un jeu de tests instable, ce qui est
 * pire qu'un jeu de tests lent : on finit par le relancer sans le lire.
 *
 * **Un délai dépassé est un échec, jamais un silence.** La première sonde
 * écrite pour ce fichier rendait « rien ne s'est déclenché » alors que le
 * module n'avait pas chargé du tout : le même symptôme pour deux causes
 * opposées. `attendre` lève, et son message dit ce qui était attendu.
 *
 * Lancement : `npm run test:fonctions`.
 */

const PROJET = 'demo-medere-quiz';

/** Large : le premier déclenchement paie un démarrage à froid mesuré à 13 s. */
const DELAI_MAX_MS = 60_000;

let app: App;
let base: Firestore;

beforeAll(async () => {
  for (const variable of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) {
    if (!process.env[variable]) {
      throw new Error(
        `Ces tests exigent les émulateurs Firestore, Auth et Functions. ` +
          `Lancez-les par \`npm run test:fonctions\`. Variable absente : ${variable}.`,
      );
    }
  }

  app = initializeApp({ projectId: PROJET }, 'declencheurs');
  base = getFirestore(app);

  await rechauffer();
}, 180_000);

afterEach(async () => {
  await effacer();
});

afterAll(async () => {
  if (app) await deleteApp(app);
});

/* ------------------------------------------------------------------ outils */

/**
 * Attend qu'une condition devienne vraie, puis rend sa valeur.
 *
 * Le sondage vaut mieux qu'un écouteur ici : on veut lire l'état final avec le
 * SDK Admin, tel qu'il est en base, sans qu'un instantané local puisse donner
 * une réponse antérieure à l'écriture de la fonction.
 */
async function attendre<T>(
  ceQuOnAttend: string,
  lire: () => Promise<T | null | undefined>,
  delaiMs = DELAI_MAX_MS,
): Promise<T> {
  const echeance = Date.now() + delaiMs;

  while (Date.now() < echeance) {
    const valeur = await lire();
    if (valeur !== null && valeur !== undefined && valeur !== false) return valeur;
    await new Promise((suite) => setTimeout(suite, 200));
  }

  throw new Error(
    `Délai dépassé (${delaiMs} ms) : ${ceQuOnAttend}. ` +
      `Si aucune fonction ne s'est déclenchée du tout, lisez le journal de ` +
      `l'émulateur : « User code failed to load » y désigne aussi bien un ` +
      `module en échec qu'une découverte trop lente.`,
  );
}

/** Attend qu'une condition reste fausse : rien ne doit se produire. */
async function resterVide(quoi: string, chemin: string, delaiMs = 4_000): Promise<void> {
  const echeance = Date.now() + delaiMs;
  while (Date.now() < echeance) {
    if ((await base.doc(chemin).get()).exists) {
      throw new Error(`${quoi} : le document « ${chemin} » a été écrit alors qu'il ne devait pas.`);
    }
    await new Promise((suite) => setTimeout(suite, 200));
  }
}

function seance(remplacements: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    code: 'JEUDI7',
    questionIds: ['q1', 'q2'],
    indexCourant: 0,
    revelee: false,
    statut: 'encours',
    animateurUid: 'uid-noemie',
    creeeLe: new Date(),
    repartition: [],
    repondants: 0,
    dureeQuestionSecondes: 45,
    questionOuverteLe: new Date(),
    ...remplacements,
  };
}

async function poserSeance(
  id: string,
  remplacements: Record<string, unknown> = {},
): Promise<void> {
  await base.doc(`sessions/${id}`).set(seance(remplacements));
}

async function poserParticipant(
  sessionId: string,
  uid: string,
  nom: string,
  avatar = 'bleu',
): Promise<void> {
  await base
    .doc(`sessions/${sessionId}/participants/${uid}`)
    .set({ nom, avatar, rejointLe: new Date() });
}

async function poserReponseDeSeance(
  sessionId: string,
  uid: string,
  questionId: string,
  correcte: boolean,
  repondueLe = new Date(),
): Promise<void> {
  await base.doc(`sessions/${sessionId}/reponses/${uid}_${questionId}`).set({
    uid,
    questionId,
    optionsChoisies: [correcte ? 'a' : 'b'],
    correcte,
    repondueLe,
  });
}

async function poserReponsePersonnelle(
  uid: string,
  questionId: string,
  correcte: boolean,
): Promise<void> {
  await base.doc(`users/${uid}/reponses/${questionId}_${Date.now()}`).set({
    questionId,
    correcte,
    optionsChoisies: [correcte ? 'a' : 'b'],
    origine: 'entrainement',
    repondueLe: new Date(),
  });
}

/** Efface tout ce qu'un test a pu semer, y compris ce que les fonctions ont écrit. */
async function effacer(): Promise<void> {
  for (const collection of ['sessions', 'users', 'questionStats']) {
    await base.recursiveDelete(base.collection(collection));
  }
}

/**
 * Fait tourner chaque fonction une fois avant le premier test.
 *
 * Sans cela, le premier test de chaque déclencheur paierait le démarrage à
 * froid, et son échec au délai ressemblerait à un défaut du code.
 */
async function rechauffer(): Promise<void> {
  await poserSeance('rechauffe');
  await poserParticipant('rechauffe', 'u-rechauffe', 'Réchauffe');
  await poserReponseDeSeance('rechauffe', 'u-rechauffe', 'q1', true);

  await attendre('le compteur de la séance de réchauffe monte à 1', async () => {
    const donnees = (await base.doc('sessions/rechauffe').get()).data();
    return donnees?.repondants === 1 ? true : null;
  });

  await base.doc('sessions/rechauffe').update({ statut: 'terminee' });
  await attendre('le bilan de la séance de réchauffe est écrit', async () =>
    (await base.doc('sessions/rechauffe/bilan/final').get()).exists ? true : null,
  );

  await getAuth(app).createUser({ uid: 'u-rechauffe' });
  await poserReponsePersonnelle('u-rechauffe', 'q-rechauffe', true);
  await attendre('l’agrégat de la question de réchauffe est écrit', async () =>
    (await base.doc('questionStats/q-rechauffe').get()).exists ? true : null,
  );

  await getAuth(app).deleteUser('u-rechauffe');
  await effacer();
}

/* ======================================================================== *
 * classerSessionTerminee                                                    *
 * ======================================================================== */

/**
 * **La fonction qui n'avait jamais tourné.** Le bilan n'a été écrit ni en
 * local ni en production : son premier exercice réel aurait eu lieu un jeudi
 * matin, sur la séance de Noémie, et son échec se serait vu sur l'écran « Ce
 * qui a trébuché » — après la séance, quand il n'y a plus rien à rattraper.
 */
describe('classerSessionTerminee', () => {
  it('écrit le bilan, le classement et un prix par participant', async () => {
    await poserSeance('s1');
    await poserParticipant('s1', 'u-yanis', 'Yanis', 'bleu');
    await poserParticipant('s1', 'u-lea', 'Léa', 'rose');
    await poserParticipant('s1', 'u-sami', 'Sami', 'vert');

    // Yanis deux justes, Léa une, Sami aucune : un podium sans égalité.
    await poserReponseDeSeance('s1', 'u-yanis', 'q1', true);
    await poserReponseDeSeance('s1', 'u-yanis', 'q2', true);
    await poserReponseDeSeance('s1', 'u-lea', 'q1', true);
    await poserReponseDeSeance('s1', 'u-lea', 'q2', false);
    await poserReponseDeSeance('s1', 'u-sami', 'q1', false);

    await base.doc('sessions/s1').update({ statut: 'terminee' });

    const classement = await attendre('le classement est écrit', async () => {
      const document = await base.doc('sessions/s1/classement/final').get();
      return document.exists ? document.data() : null;
    });

    expect(classement?.rangs).toEqual([
      { uid: 'u-yanis', nom: 'Yanis', avatar: 'bleu', justes: 2, rang: 1, distinction: 'diamant' },
      { uid: 'u-lea', nom: 'Léa', avatar: 'rose', justes: 1, rang: 2, distinction: 'or' },
      { uid: 'u-sami', nom: 'Sami', avatar: 'vert', justes: 0, rang: 3, distinction: 'argent' },
    ]);

    const bilan = await attendre('le bilan est écrit', async () => {
      const document = await base.doc('sessions/s1/bilan/final').get();
      return document.exists ? document.data() : null;
    });

    // Deux compteurs par question, dans l'ordre où elles ont été posées.
    expect(bilan?.questions).toEqual([
      { questionId: 'q1', reponses: 3, echecs: 1 },
      { questionId: 'q2', reponses: 2, echecs: 1 },
    ]);
    expect(bilan?.participants).toBe(3);

    // Le prix est privé et durable : un document par personne, sous elle.
    const prix = await attendre('le prix de Yanis est écrit', async () => {
      const document = await base.doc('users/u-yanis/prix/s1').get();
      return document.exists ? document.data() : null;
    });

    expect(prix).toMatchObject({
      codeSession: 'JEUDI7',
      distinction: 'diamant',
      rang: 1,
      justes: 2,
      participants: 3,
    });

    expect((await base.doc('users/u-lea/prix/s1').get()).data()).toMatchObject({
      distinction: 'or',
      rang: 2,
    });
  });

  it('donne un rang sans distinction au quatrième', async () => {
    await poserSeance('s1');
    const salle: [string, string][] = [
      ['u-a', 'Ana'],
      ['u-b', 'Bilal'],
      ['u-c', 'Carla'],
      ['u-d', 'Driss'],
    ];
    for (const [uid, nom] of salle) {
      await poserParticipant('s1', uid, nom);
    }
    await poserReponseDeSeance('s1', 'u-a', 'q1', true);
    await poserReponseDeSeance('s1', 'u-a', 'q2', true);
    await poserReponseDeSeance('s1', 'u-b', 'q1', true);
    await poserReponseDeSeance('s1', 'u-c', 'q1', true);
    await poserReponseDeSeance('s1', 'u-d', 'q1', false);

    await base.doc('sessions/s1').update({ statut: 'terminee' });

    const prix = await attendre('le prix du quatrième est écrit', async () => {
      const document = await base.doc('users/u-d/prix/s1').get();
      return document.exists ? document.data() : null;
    });

    // Le rang existe toujours, la distinction s'arrête au podium. Le
    // quatrième a sa trace de la séance, elle n'est lue que par lui.
    expect(prix).toMatchObject({ rang: 4, distinction: null, justes: 0 });
  });

  it('une séance abandonnée reçoit un bilan, aucun classement, aucun prix', async () => {
    await poserSeance('s1');
    await poserParticipant('s1', 'u-yanis', 'Yanis');
    await poserReponseDeSeance('s1', 'u-yanis', 'q1', true);

    await base.doc('sessions/s1').update({ statut: 'abandonnee' });

    const bilan = await attendre('le bilan de la séance abandonnée est écrit', async () => {
      const document = await base.doc('sessions/s1/bilan/final').get();
      return document.exists ? document.data() : null;
    });

    // Ce qui a été posé reste utile pour préparer la suivante, et c'est anonyme.
    expect(bilan?.questions).toEqual([
      { questionId: 'q1', reponses: 1, echecs: 0 },
      { questionId: 'q2', reponses: 0, echecs: 0 },
    ]);

    // Le classement ne voudrait rien dire : la salle s'est vidée en route.
    await resterVide('séance abandonnée', 'sessions/s1/classement/final');
    await resterVide('séance abandonnée', 'users/u-yanis/prix/s1');
  });

  it('le bilan ne porte aucun identifiant de participant', async () => {
    await poserSeance('s1');
    await poserParticipant('s1', 'u-yanis', 'Yanis');
    await poserParticipant('s1', 'u-lea', 'Léa');
    await poserReponseDeSeance('s1', 'u-yanis', 'q1', true);
    await poserReponseDeSeance('s1', 'u-lea', 'q1', false);

    await base.doc('sessions/s1').update({ statut: 'terminee' });

    const bilan = await attendre('le bilan est écrit', async () => {
      const document = await base.doc('sessions/s1/bilan/final').get();
      return document.exists ? document.data() : null;
    });

    /*
     * **L'anonymat du bilan n'est pas une intention, c'est une propriété.**
     * L'historique d'une séance se lit ici, après que la lecture nominative des
     * votes s'est éteinte. Si quelqu'un ajoute un jour un uid ou un nom « juste
     * pour déboguer », ce test tombe — et c'est tout l'objet de cette règle
     * d'isolation qui s'effondrerait sans bruit.
     */
    const texte = JSON.stringify(bilan);
    expect(texte).not.toContain('u-yanis');
    expect(texte).not.toContain('u-lea');
    expect(texte).not.toContain('Yanis');
    expect(texte).not.toContain('Léa');
    expect(Object.keys(bilan ?? {}).sort()).toEqual(['etabliLe', 'participants', 'questions']);
  });

  it('une séance terminée sans aucune réponse reçoit un bilan et rien d’autre', async () => {
    await poserSeance('s1');
    await poserParticipant('s1', 'u-yanis', 'Yanis');

    await base.doc('sessions/s1').update({ statut: 'terminee' });

    const bilan = await attendre('le bilan de la séance vide est écrit', async () => {
      const document = await base.doc('sessions/s1/bilan/final').get();
      return document.exists ? document.data() : null;
    });

    // « Personne n'a répondu » est une information : l'absence de document
    // ressemblerait à une panne.
    expect(bilan?.questions).toEqual([
      { questionId: 'q1', reponses: 0, echecs: 0 },
      { questionId: 'q2', reponses: 0, echecs: 0 },
    ]);
    await resterVide('séance sans réponse', 'sessions/s1/classement/final');
  });

  it('ne se relance pas sur une écriture ultérieure d’une séance déjà close', async () => {
    await poserSeance('s1');
    await poserParticipant('s1', 'u-yanis', 'Yanis');
    await poserReponseDeSeance('s1', 'u-yanis', 'q1', true);

    await base.doc('sessions/s1').update({ statut: 'terminee' });
    await attendre('le classement est écrit', async () =>
      (await base.doc('sessions/s1/classement/final').get()).exists ? true : null,
    );

    const premier = (await base.doc('sessions/s1/classement/final').get()).data();

    // Une seconde réponse arrive en retard, puis la séance est réécrite sans
    // changer d'état : le classement ne doit pas être recalculé avec elle.
    await poserReponseDeSeance('s1', 'u-lea', 'q1', true);
    await base.doc('sessions/s1').update({ revelee: true });

    await new Promise((suite) => setTimeout(suite, 4_000));

    const second = (await base.doc('sessions/s1/classement/final').get()).data();
    expect(second?.rangs).toEqual(premier?.rangs);
    await resterVide('séance déjà close', 'users/u-lea/prix/s1', 1_000);
  });
});

/* ======================================================================== *
 * compterReponseSession                                                     *
 * ======================================================================== */

describe('compterReponseSession', () => {
  it('compte une réponse portant sur la question ouverte', async () => {
    await poserSeance('s1');
    await poserReponseDeSeance('s1', 'u-yanis', 'q1', true);

    const compte = await attendre('le compteur monte à 1', async () => {
      const donnees = (await base.doc('sessions/s1').get()).data();
      return donnees?.repondants === 1 ? donnees.repondants : null;
    });

    expect(compte).toBe(1);

    await poserReponseDeSeance('s1', 'u-lea', 'q1', false);
    expect(
      await attendre('le compteur monte à 2', async () => {
        const donnees = (await base.doc('sessions/s1').get()).data();
        return donnees?.repondants === 2 ? donnees.repondants : null;
      }),
    ).toBe(2);
  });

  it('ne compte pas une réponse arrivée après le passage à la question suivante', async () => {
    // La séance est déjà sur `q2` ; une réponse à `q1` arrive en retard.
    await poserSeance('s1', { indexCourant: 1 });
    await poserReponseDeSeance('s1', 'u-yanis', 'q1', true);

    await new Promise((suite) => setTimeout(suite, 5_000));

    // Comptée, elle ferait démarrer la question suivante à « 1 réponse », et
    // personne ne comprendrait d'où elle sort.
    expect((await base.doc('sessions/s1').get()).data()?.repondants).toBe(0);
  });

  it('ne compte pas une réponse arrivée après la révélation', async () => {
    await poserSeance('s1', { revelee: true });
    await poserReponseDeSeance('s1', 'u-yanis', 'q1', true);

    await new Promise((suite) => setTimeout(suite, 5_000));

    expect((await base.doc('sessions/s1').get()).data()?.repondants).toBe(0);
  });
});

/* ======================================================================== *
 * agregerReponseEntrainement                                                *
 * ======================================================================== */

describe('agregerReponseEntrainement', () => {
  afterEach(async () => {
    for (const utilisateur of await getAuth(app).listUsers(100).then((page) => page.users)) {
      await getAuth(app).deleteUser(utilisateur.uid);
    }
  });

  it('agrège la réponse d’un commercial, sans aucun identifiant', async () => {
    await getAuth(app).createUser({ uid: 'u-yanis' });
    await poserReponsePersonnelle('u-yanis', 'q1', false);

    const agregat = await attendre('l’agrégat de q1 est écrit', async () => {
      const document = await base.doc('questionStats/q1').get();
      return document.exists ? document.data() : null;
    });

    expect(agregat).toMatchObject({ tentatives: 1, echecs: 1 });
    // L'agrégat ne porte que ses trois champs. Aucun uid n'y entre, jamais :
    // c'est la seule source des statistiques, et elle est publique aux
    // administrateurs.
    expect(Object.keys(agregat ?? {}).sort()).toEqual(['echecs', 'majLe', 'tentatives']);
  });

  it('tient la réponse d’un administrateur hors de l’agrégat', async () => {
    // Noémie parcourt le quiz pour relire ses explications en situation : ses
    // réponses sont justes par construction et fausseraient le taux d'échec.
    await getAuth(app).createUser({ uid: 'u-noemie' });
    await getAuth(app).setCustomUserClaims('u-noemie', { admin: true });

    await poserReponsePersonnelle('u-noemie', 'q1', true);

    await resterVide('réponse d’un administrateur', 'questionStats/q1', 6_000);
  });

  it('cumule plusieurs réponses sur la même question', async () => {
    await getAuth(app).createUser({ uid: 'u-yanis' });
    await getAuth(app).createUser({ uid: 'u-lea' });

    await poserReponsePersonnelle('u-yanis', 'q1', false);
    await attendre('la première réponse est agrégée', async () => {
      const donnees = (await base.doc('questionStats/q1').get()).data();
      return donnees?.tentatives === 1 ? true : null;
    });

    await poserReponsePersonnelle('u-lea', 'q1', true);
    const agregat = await attendre('la seconde réponse est agrégée', async () => {
      const donnees = (await base.doc('questionStats/q1').get()).data();
      return donnees?.tentatives === 2 ? donnees : null;
    });

    expect(agregat).toMatchObject({ tentatives: 2, echecs: 1 });
  });
});
