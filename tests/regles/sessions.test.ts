import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest';

import {
  anonyme,
  connecte,
  creerEnvironnement,
  demain,
  EXTERNE,
  JORDAN,
  NOEMIE,
  question,
  reponseSession,
  session,
  SOPHIE,
} from './aide';

let env: RulesTestEnvironment;

type Document = Record<string, unknown>;

function sans(document: Document, champ: string): Document {
  const copie = { ...document };
  delete copie[champ];
  return copie;
}

const AUTRE_ADMIN = { uid: 'uid-autre-admin', email: 'admin2@medere.fr', admin: true };

const QCM_MULTIPLE = question({
  type: 'qcm',
  enonce: 'Quelles formations sont éligibles au DPC ?',
  options: { a: 'Parodontie', b: 'Implantologie', c: 'Endodontie', d: 'Orthodontie' },
  ordreOptions: ['a', 'b', 'c', 'd'],
  bonnesReponses: ['a', 'c'],
});

beforeAll(async () => {
  env = await creerEnvironnement();
});

afterEach(async () => {
  await env.clearFirestore();
});

afterAll(async () => {
  await env.cleanup();
});

async function semer(): Promise<void> {
  await env.withSecurityRulesDisabled(async (contexte) => {
    const base = contexte.firestore();
    await setDoc(doc(base, 'questions/q-vf'), question());
    await setDoc(doc(base, 'questions/q-qcm'), QCM_MULTIPLE);
    await setDoc(doc(base, 'questions/q-brouillon'), question({ statut: 'brouillon' }));
    await setDoc(doc(base, 'sessions/s1'), session());
    await setDoc(
      doc(base, `sessions/s1/reponses/${SOPHIE.uid}_q-vf`),
      reponseSession(SOPHIE.uid, { questionId: 'q-vf' }),
    );
  });
}

describe('Session collective — accès', () => {
  it('tout commercial du domaine lit la session en cours', async () => {
    await semer();
    await assertSucceeds(getDoc(doc(connecte(env, JORDAN), 'sessions/s1')));
  });

  it('REFUS — un utilisateur hors domaine ne lit pas la session', async () => {
    await semer();
    await assertFails(getDoc(doc(connecte(env, EXTERNE), 'sessions/s1')));
  });

  it('REFUS — un visiteur non authentifié ne lit pas la session', async () => {
    await semer();
    await assertFails(getDoc(doc(anonyme(env), 'sessions/s1')));
  });

  it("l'animatrice crée une session et révèle la bonne réponse", async () => {
    const admin = connecte(env, NOEMIE);
    await assertSucceeds(setDoc(doc(admin, 'sessions/s2'), session()));
    await assertSucceeds(updateDoc(doc(admin, 'sessions/s2'), { revelee: true, indexCourant: 1 }));
  });

  it('REFUS — un commercial crée une session', async () => {
    await assertFails(setDoc(doc(connecte(env, JORDAN), 'sessions/s3'), session()));
  });

  it('REFUS — un commercial fait avancer la session', async () => {
    await semer();
    await assertFails(updateDoc(doc(connecte(env, JORDAN), 'sessions/s1'), { indexCourant: 1 }));
  });

  it('REFUS — un commercial révèle la bonne réponse', async () => {
    await semer();
    await assertFails(updateDoc(doc(connecte(env, JORDAN), 'sessions/s1'), { revelee: true }));
  });

  it("REFUS — un administrateur qui n'anime pas cette session la modifie ou la supprime", async () => {
    await semer();
    const autreAdmin = connecte(env, AUTRE_ADMIN);
    await assertFails(updateDoc(doc(autreAdmin, 'sessions/s1'), { revelee: true }));
    await assertFails(deleteDoc(doc(autreAdmin, 'sessions/s1')));
  });

  it("REFUS — un administrateur crée une session au nom d'un autre animateur", async () => {
    await assertFails(setDoc(doc(connecte(env, AUTRE_ADMIN), 'sessions/s4'), session()));
  });
});

describe('Session collective — forme du document', () => {
  function creerSession(donnees: Document, identifiant: string) {
    return setDoc(doc(connecte(env, NOEMIE), `sessions/${identifiant}`), donnees);
  }

  it('REFUS — un champ hors modèle', async () => {
    await assertFails(creerSession(session({ salle: 'visio' }), 's5'));
  });

  it('REFUS — un champ du modèle manquant', async () => {
    await assertFails(creerSession(sans(session(), 'code'), 's6'));
  });

  it('REFUS — un statut inconnu', async () => {
    await assertFails(creerSession(session({ statut: 'pause' }), 's7'));
  });

  it('REFUS — aucune question dans la session', async () => {
    await assertFails(creerSession(session({ questionIds: [], indexCourant: 0 }), 's8'));
  });

  it('REFUS — la même question deux fois dans la session', async () => {
    await assertFails(creerSession(session({ questionIds: ['q-vf', 'q-vf'] }), 's9'));
  });

  it("REFUS — un index courant au-delà du nombre de questions", async () => {
    await assertFails(creerSession(session({ indexCourant: 2 }), 's10'));
  });

  it('REFUS — un index courant négatif', async () => {
    await assertFails(creerSession(session({ indexCourant: -1 }), 's11'));
  });

  it("REFUS — un indicateur de révélation qui n'est pas un booléen", async () => {
    await assertFails(creerSession(session({ revelee: 'oui' }), 's12'));
  });

  it('REFUS — une session datée dans le futur', async () => {
    await assertFails(creerSession(session({ creeeLe: demain() }), 's13'));
  });

  it("REFUS — une modification qui pousse l'index hors des questions", async () => {
    await semer();
    await assertFails(updateDoc(doc(connecte(env, NOEMIE), 'sessions/s1'), { indexCourant: 9 }));
  });

  it('une session conforme est acceptée', async () => {
    await assertSucceeds(creerSession(session(), 's14'));
  });
});

describe('Réponses en session — accès', () => {
  it('un participant enregistre sa propre réponse', async () => {
    await semer();
    await assertSucceeds(
      setDoc(
        doc(connecte(env, JORDAN), `sessions/s1/reponses/${JORDAN.uid}_q-vf`),
        reponseSession(JORDAN.uid, { questionId: 'q-vf' }),
      ),
    );
  });

  it('un participant relit sa propre réponse', async () => {
    await semer();
    await assertSucceeds(
      getDoc(doc(connecte(env, SOPHIE), `sessions/s1/reponses/${SOPHIE.uid}_q-vf`)),
    );
  });

  it("l'animatrice lit toutes les réponses pour établir la répartition", async () => {
    await semer();
    await assertSucceeds(getDocs(collection(connecte(env, NOEMIE), 'sessions/s1/reponses')));
  });

  it("REFUS — un participant répond à la place d'un collègue", async () => {
    await semer();
    await assertFails(
      setDoc(
        doc(connecte(env, JORDAN), `sessions/s1/reponses/${SOPHIE.uid}_q-vf`),
        reponseSession(SOPHIE.uid, { questionId: 'q-vf' }),
      ),
    );
  });

  it("REFUS — un participant signe sa réponse avec l'identifiant d'un collègue", async () => {
    await semer();
    await assertFails(
      setDoc(
        doc(connecte(env, JORDAN), `sessions/s1/reponses/${JORDAN.uid}_q-vf`),
        reponseSession(SOPHIE.uid, { questionId: 'q-vf' }),
      ),
    );
  });

  it("REFUS — l'identifiant du document ne correspond pas à la question répondue", async () => {
    await semer();
    await assertFails(
      setDoc(
        doc(connecte(env, JORDAN), `sessions/s1/reponses/${JORDAN.uid}_q-qcm`),
        reponseSession(JORDAN.uid, { questionId: 'q-vf' }),
      ),
    );
  });

  it('REFUS — un participant corrige sa réponse après coup', async () => {
    await semer();
    await assertFails(
      updateDoc(doc(connecte(env, SOPHIE), `sessions/s1/reponses/${SOPHIE.uid}_q-vf`), {
        optionsChoisies: ['a'],
      }),
    );
  });

  it("REFUS — un participant lit la réponse d'un collègue", async () => {
    await semer();
    await assertFails(
      getDoc(doc(connecte(env, JORDAN), `sessions/s1/reponses/${SOPHIE.uid}_q-vf`)),
    );
  });

  it('REFUS — un participant liste les réponses de la session', async () => {
    await semer();
    await assertFails(getDocs(collection(connecte(env, JORDAN), 'sessions/s1/reponses')));
  });

  it('REFUS — un utilisateur hors domaine répond en session', async () => {
    await semer();
    await assertFails(
      setDoc(
        doc(connecte(env, EXTERNE), `sessions/s1/reponses/${EXTERNE.uid}_q-vf`),
        reponseSession(EXTERNE.uid, { questionId: 'q-vf' }),
      ),
    );
  });
});

describe('Réponses en session — forme et verdict', () => {
  const chemin = (questionId: string) => `sessions/s1/reponses/${JORDAN.uid}_${questionId}`;

  async function ecrire(donnees: Document, questionId = 'q-vf') {
    return setDoc(doc(connecte(env, JORDAN), chemin(questionId)), donnees);
  }

  it('une bonne réponse annoncée correcte est acceptée', async () => {
    await semer();
    await assertSucceeds(
      ecrire(
        reponseSession(JORDAN.uid, {
          questionId: 'q-vf',
          optionsChoisies: ['a'],
          correcte: true,
        }),
      ),
    );
  });

  it("un QCM multiple dont l'ensemble sélectionné est exact est accepté", async () => {
    await semer();
    await assertSucceeds(
      ecrire(
        reponseSession(JORDAN.uid, {
          questionId: 'q-qcm',
          optionsChoisies: ['c', 'a'],
          correcte: true,
        }),
        'q-qcm',
      ),
    );
  });

  it('REFUS — une réponse partielle déclarée correcte', async () => {
    await semer();
    await assertFails(
      ecrire(
        reponseSession(JORDAN.uid, {
          questionId: 'q-qcm',
          optionsChoisies: ['a'],
          correcte: true,
        }),
        'q-qcm',
      ),
    );
  });

  it('REFUS — une réponse exacte déclarée fausse', async () => {
    await semer();
    await assertFails(
      ecrire(
        reponseSession(JORDAN.uid, {
          questionId: 'q-qcm',
          optionsChoisies: ['a', 'c'],
          correcte: false,
        }),
        'q-qcm',
      ),
    );
  });

  it('REFUS — une mauvaise réponse déclarée correcte', async () => {
    await semer();
    await assertFails(
      ecrire(
        reponseSession(JORDAN.uid, {
          questionId: 'q-vf',
          optionsChoisies: ['b'],
          correcte: true,
        }),
      ),
    );
  });

  it("REFUS — une option choisie qui n'existe pas dans la question", async () => {
    await semer();
    await assertFails(
      ecrire(reponseSession(JORDAN.uid, { questionId: 'q-vf', optionsChoisies: ['z'] })),
    );
  });

  it('REFUS — une réponse qui référence une question inexistante', async () => {
    await semer();
    await assertFails(
      ecrire(reponseSession(JORDAN.uid, { questionId: 'q-fantome' }), 'q-fantome'),
    );
  });

  it('REFUS — une réponse qui référence une question en brouillon', async () => {
    await semer();
    await assertFails(
      ecrire(reponseSession(JORDAN.uid, { questionId: 'q-brouillon' }), 'q-brouillon'),
    );
  });

  it('REFUS — un champ hors modèle', async () => {
    await semer();
    await assertFails(
      ecrire(reponseSession(JORDAN.uid, { questionId: 'q-vf', origine: 'session' })),
    );
  });

  it('REFUS — un champ du modèle manquant', async () => {
    await semer();
    await assertFails(ecrire(sans(reponseSession(JORDAN.uid, { questionId: 'q-vf' }), 'correcte')));
  });

  it("REFUS — un verdict qui n'est pas un booléen", async () => {
    await semer();
    await assertFails(
      ecrire(reponseSession(JORDAN.uid, { questionId: 'q-vf', correcte: 'false' })),
    );
  });

  it('REFUS — une réponse horodatée dans le futur', async () => {
    await semer();
    await assertFails(
      ecrire(reponseSession(JORDAN.uid, { questionId: 'q-vf', repondueLe: demain() })),
    );
  });

  it('REFUS — une option choisie deux fois', async () => {
    await semer();
    await assertFails(
      ecrire(reponseSession(JORDAN.uid, { questionId: 'q-vf', optionsChoisies: ['b', 'b'] })),
    );
  });
});
