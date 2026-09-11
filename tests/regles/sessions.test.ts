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
  participant,
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

  it('accepte les cinq états d’une séance', async () => {
    // `pause` et `abandonnee` sont arrivées au lot 7 : une séance qu'on ne
    // peut pas suspendre ni interrompre n'est pas un outil fini.
    for (const [index, statut] of [
      'attente',
      'encours',
      'pause',
      'terminee',
      'abandonnee',
    ].entries()) {
      await assertSucceeds(creerSession(session({ statut }), `s-etat-${index}`));
    }
  });

  it('REFUS — un statut inconnu', async () => {
    await assertFails(creerSession(session({ statut: 'suspendue' }), 's7'));
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

/**
 * Ce que ces tests protègent : la répartition reste anonyme, et personne ne
 * vote après la révélation.
 *
 * Les deux tiennent la même promesse. La répartition existe parce qu'un
 * participant ne peut pas la calculer — il ne lit pas les réponses des autres,
 * décision du lot 1 — et elle ne doit donc porter que des nombres. Le vote
 * fermé après révélation empêche qu'une réponse gratuite alimente la
 * progression et les statistiques : une fois la bonne réponse à l'écran,
 * répondre juste ne prouve plus rien.
 */
describe('Session collective — répartition et fermeture du vote', () => {
  it('l’animatrice écrit la répartition en révélant', async () => {
    await semer();
    await assertSucceeds(
      updateDoc(doc(connecte(env, NOEMIE), 'sessions/s1'), {
        revelee: true,
        repartition: [3, 5, 1, 0],
        repondants: 9,
      }),
    );
  });

  it('REFUS — une répartition qui n’est pas une liste de nombres', async () => {
    await semer();
    await assertFails(
      updateDoc(doc(connecte(env, NOEMIE), 'sessions/s1'), {
        revelee: true,
        repartition: { a: 3, b: 5 },
        repondants: 9,
      }),
    );
  });

  it('REFUS — un compte de répondants négatif', async () => {
    await semer();
    await assertFails(
      updateDoc(doc(connecte(env, NOEMIE), 'sessions/s1'), { repondants: -1 }),
    );
  });

  it('REFUS — une session sans répartition', async () => {
    await semer();
    await assertFails(
      setDoc(doc(connecte(env, NOEMIE), 'sessions/s2'), sans(session(), 'repartition')),
    );
  });

  it('un commercial vote tant que la réponse n’est pas révélée', async () => {
    await semer();
    await assertSucceeds(
      setDoc(
        doc(connecte(env, JORDAN), `sessions/s1/reponses/${JORDAN.uid}_q-vf`),
        reponseSession(JORDAN.uid, { questionId: 'q-vf' }),
      ),
    );
  });

  it('REFUS — voter après la révélation', async () => {
    await semer();
    await env.withSecurityRulesDisabled(async (contexte) => {
      await updateDoc(doc(contexte.firestore(), 'sessions/s1'), { revelee: true });
    });

    await assertFails(
      setDoc(
        doc(connecte(env, JORDAN), `sessions/s1/reponses/${JORDAN.uid}_q-vf`),
        reponseSession(JORDAN.uid, { questionId: 'q-vf' }),
      ),
    );
  });

  it('REFUS — voter dans une session terminée', async () => {
    await semer();
    await env.withSecurityRulesDisabled(async (contexte) => {
      await updateDoc(doc(contexte.firestore(), 'sessions/s1'), { statut: 'terminee' });
    });

    await assertFails(
      setDoc(
        doc(connecte(env, JORDAN), `sessions/s1/reponses/${JORDAN.uid}_q-vf`),
        reponseSession(JORDAN.uid, { questionId: 'q-vf' }),
      ),
    );
  });

  it('REFUS — voter dans une session en attente d’ouverture', async () => {
    await semer();
    await env.withSecurityRulesDisabled(async (contexte) => {
      await updateDoc(doc(contexte.firestore(), 'sessions/s1'), { statut: 'attente' });
    });

    await assertFails(
      setDoc(
        doc(connecte(env, JORDAN), `sessions/s1/reponses/${JORDAN.uid}_q-vf`),
        reponseSession(JORDAN.uid, { questionId: 'q-vf' }),
      ),
    );
  });
});

/**
 * Ce que ces tests protègent : le chronomètre est une échéance partagée, pas
 * une durée que chaque appareil démarrerait pour lui-même.
 *
 * Un participant en visioconférence voit l'écran partagé avec du retard. Si le
 * décompte partait de son arrivée, il aurait plus de temps que les autres — ou
 * moins, s'il rejoint tard. `questionOuverteLe` fixe l'instant, tout le monde
 * calcule le même reste.
 */
describe('Session collective — chronomètre', () => {
  it('accepte une durée nulle : une séance peut se mener sans chronomètre', async () => {
    await semer();
    await assertSucceeds(
      setDoc(
        doc(connecte(env, NOEMIE), 'sessions/s3'),
        session({ dureeQuestionSecondes: 0 }),
      ),
    );
  });

  it('REFUS — une durée négative', async () => {
    await semer();
    await assertFails(
      setDoc(
        doc(connecte(env, NOEMIE), 'sessions/s3'),
        session({ dureeQuestionSecondes: -5 }),
      ),
    );
  });

  it('REFUS — une durée au-delà du plafond', async () => {
    await semer();
    await assertFails(
      setDoc(
        doc(connecte(env, NOEMIE), 'sessions/s3'),
        session({ dureeQuestionSecondes: 601 }),
      ),
    );
  });

  it('REFUS — une durée qui n’est pas un entier', async () => {
    await semer();
    await assertFails(
      setDoc(
        doc(connecte(env, NOEMIE), 'sessions/s3'),
        session({ dureeQuestionSecondes: 45.5 }),
      ),
    );
  });

  it('REFUS — une ouverture de question dans le futur', async () => {
    await semer();
    await assertFails(
      setDoc(
        doc(connecte(env, NOEMIE), 'sessions/s3'),
        session({ questionOuverteLe: demain() }),
      ),
    );
  });

  it('REFUS — une session sans chronomètre déclaré', async () => {
    await semer();
    await assertFails(
      setDoc(
        doc(connecte(env, NOEMIE), 'sessions/s3'),
        sans(session(), 'questionOuverteLe'),
      ),
    );
  });
});

/**
 * Ce que ces tests protègent : les absents ne voient pas le classement.
 *
 * C'est une décision de produit — ils n'étaient pas là — et elle est tenue par
 * les règles, pas par l'affichage. Le marqueur de présence n'est posable que
 * pendant la séance : on ne s'inscrit pas après coup pour lire le tableau.
 */
describe('Session collective — présence et classement', () => {
  it('un commercial se déclare présent pendant la séance', async () => {
    await semer();
    await assertSucceeds(
      setDoc(
        doc(connecte(env, JORDAN), `sessions/s1/participants/${JORDAN.uid}`),
        participant(),
      ),
    );
  });

  it('REFUS — se déclarer présent sous l’uid d’un autre', async () => {
    await semer();
    await assertFails(
      setDoc(
        doc(connecte(env, JORDAN), `sessions/s1/participants/${SOPHIE.uid}`),
        participant(),
      ),
    );
  });

  it('REFUS — se déclarer présent après la fin de la séance', async () => {
    await semer();
    await env.withSecurityRulesDisabled(async (contexte) => {
      await updateDoc(doc(contexte.firestore(), 'sessions/s1'), { statut: 'terminee' });
    });

    await assertFails(
      setDoc(
        doc(connecte(env, JORDAN), `sessions/s1/participants/${JORDAN.uid}`),
        participant(),
      ),
    );
  });

  it('REFUS — un nom d’affichage au-delà de la borne d’écran projeté', async () => {
    await semer();
    await assertFails(
      setDoc(
        doc(connecte(env, JORDAN), `sessions/s1/participants/${JORDAN.uid}`),
        participant({ nom: 'x'.repeat(33) }),
      ),
    );
  });

  it('REFUS — un nom d’affichage vide', async () => {
    await semer();
    await assertFails(
      setDoc(
        doc(connecte(env, JORDAN), `sessions/s1/participants/${JORDAN.uid}`),
        participant({ nom: '   ' }),
      ),
    );
  });

  it('un participant change son nom sans changer son heure d’arrivée', async () => {
    await semer();
    await env.withSecurityRulesDisabled(async (contexte) => {
      await setDoc(
        doc(contexte.firestore(), `sessions/s1/participants/${JORDAN.uid}`),
        participant(),
      );
    });

    await assertSucceeds(
      updateDoc(doc(connecte(env, JORDAN), `sessions/s1/participants/${JORDAN.uid}`), {
        nom: 'Jojo',
      }),
    );
  });

  it('REFUS — antidater son arrivée', async () => {
    await semer();
    await env.withSecurityRulesDisabled(async (contexte) => {
      await setDoc(
        doc(contexte.firestore(), `sessions/s1/participants/${JORDAN.uid}`),
        participant(),
      );
    });

    await assertFails(
      updateDoc(doc(connecte(env, JORDAN), `sessions/s1/participants/${JORDAN.uid}`), {
        rejointLe: new Date('2026-01-01T09:00:00Z'),
      }),
    );
  });

  it('un présent lit le classement', async () => {
    await semer();
    await env.withSecurityRulesDisabled(async (contexte) => {
      const base = contexte.firestore();
      await setDoc(doc(base, `sessions/s1/participants/${JORDAN.uid}`), participant());
      await setDoc(doc(base, 'sessions/s1/classement/final'), { rangs: [] });
    });

    await assertSucceeds(getDoc(doc(connecte(env, JORDAN), 'sessions/s1/classement/final')));
  });

  it('l’animatrice lit le classement sans avoir voté', async () => {
    await semer();
    await env.withSecurityRulesDisabled(async (contexte) => {
      await setDoc(doc(contexte.firestore(), 'sessions/s1/classement/final'), { rangs: [] });
    });

    await assertSucceeds(getDoc(doc(connecte(env, NOEMIE), 'sessions/s1/classement/final')));
  });

  it('REFUS — un absent ne lit pas le classement', async () => {
    await semer();
    await env.withSecurityRulesDisabled(async (contexte) => {
      await setDoc(doc(contexte.firestore(), 'sessions/s1/classement/final'), { rangs: [] });
    });

    await assertFails(getDoc(doc(connecte(env, JORDAN), 'sessions/s1/classement/final')));
  });

  it('REFUS — personne n’écrit le classement, animatrice comprise', async () => {
    await semer();
    await assertFails(
      setDoc(doc(connecte(env, NOEMIE), 'sessions/s1/classement/final'), { rangs: [] }),
    );
  });
});

/**
 * Ce que ces tests protègent : l'avatar affiché sur un écran projeté.
 *
 * La liste des teintes est fermée dans les règles, pas seulement dans le
 * navigateur. Une valeur inconnue passerait la validation du client et
 * s'afficherait en gris devant la salle, ou pas du tout.
 */
describe('Session collective — avatar', () => {
  it('accepte une teinte de la palette', async () => {
    await semer();
    await assertSucceeds(
      setDoc(
        doc(connecte(env, JORDAN), `sessions/s1/participants/${JORDAN.uid}`),
        participant({ avatar: 'rose' }),
      ),
    );
  });

  it('REFUS — une teinte hors palette', async () => {
    await semer();
    await assertFails(
      setDoc(
        doc(connecte(env, JORDAN), `sessions/s1/participants/${JORDAN.uid}`),
        participant({ avatar: 'fuchsia' }),
      ),
    );
  });

  it('REFUS — un marqueur sans avatar', async () => {
    await semer();
    await assertFails(
      setDoc(
        doc(connecte(env, JORDAN), `sessions/s1/participants/${JORDAN.uid}`),
        sans(participant(), 'avatar'),
      ),
    );
  });
});

/**
 * Ce que ces tests protègent : une séance qu'on peut arrêter.
 *
 * Le vote ne se ferme pas côté client. Une fenêtre restée ouverte, un
 * téléphone en veille qui se réveille : rien de tout cela ne doit pouvoir
 * voter dans une séance suspendue ou interrompue.
 */
describe('Session collective — pause et interruption', () => {
  for (const statut of ['pause', 'terminee', 'abandonnee']) {
    it(`REFUS — voter dans une séance « ${statut} »`, async () => {
      await semer();
      await env.withSecurityRulesDisabled(async (contexte) => {
        await updateDoc(doc(contexte.firestore(), 'sessions/s1'), { statut });
      });

      await assertFails(
        setDoc(
          doc(connecte(env, JORDAN), `sessions/s1/reponses/${JORDAN.uid}_q-vf`),
          reponseSession(JORDAN.uid, { questionId: 'q-vf' }),
        ),
      );
    });
  }

  it('on rejoint encore pendant une pause : c’est le moment du retardataire', async () => {
    await semer();
    await env.withSecurityRulesDisabled(async (contexte) => {
      await updateDoc(doc(contexte.firestore(), 'sessions/s1'), { statut: 'pause' });
    });

    await assertSucceeds(
      setDoc(
        doc(connecte(env, JORDAN), `sessions/s1/participants/${JORDAN.uid}`),
        participant(),
      ),
    );
  });

  it('REFUS — rejoindre une séance abandonnée', async () => {
    await semer();
    await env.withSecurityRulesDisabled(async (contexte) => {
      await updateDoc(doc(contexte.firestore(), 'sessions/s1'), { statut: 'abandonnee' });
    });

    await assertFails(
      setDoc(
        doc(connecte(env, JORDAN), `sessions/s1/participants/${JORDAN.uid}`),
        participant(),
      ),
    );
  });

  it('l’animatrice suspend et reprend sa séance', async () => {
    await semer();
    const base = connecte(env, NOEMIE);
    await assertSucceeds(updateDoc(doc(base, 'sessions/s1'), { statut: 'pause' }));
    await assertSucceeds(updateDoc(doc(base, 'sessions/s1'), { statut: 'encours' }));
  });

  it('REFUS — un participant suspend la séance', async () => {
    await semer();
    await assertFails(
      updateDoc(doc(connecte(env, JORDAN), 'sessions/s1'), { statut: 'pause' }),
    );
  });
});

/**
 * Ce que ces tests protègent : l'archive nominative qui n'existe pas.
 *
 * Pendant la séance, l'animatrice lit les votes de la salle — c'est l'exercice.
 * Une fois la séance close, ce droit disparaît : le garder ferait de chaque
 * jeudi passé une archive de qui a raté quoi, exactement ce que l'isolation des
 * scores interdit partout ailleurs dans l'outil.
 */
describe('Session collective — bilan et archive', () => {
  it('l’animatrice lit les votes pendant la séance', async () => {
    await semer();
    await assertSucceeds(getDocs(collection(connecte(env, NOEMIE), 'sessions/s1/reponses')));
  });

  for (const statut of ['terminee', 'abandonnee']) {
    it(`REFUS — relire les votes nominatifs d’une séance « ${statut} »`, async () => {
      await semer();
      await env.withSecurityRulesDisabled(async (contexte) => {
        await updateDoc(doc(contexte.firestore(), 'sessions/s1'), { statut });
      });

      await assertFails(getDocs(collection(connecte(env, NOEMIE), 'sessions/s1/reponses')));
    });
  }

  it('l’animatrice lit le bilan anonyme d’une séance close', async () => {
    await semer();
    await env.withSecurityRulesDisabled(async (contexte) => {
      const base = contexte.firestore();
      await updateDoc(doc(base, 'sessions/s1'), { statut: 'terminee' });
      await setDoc(doc(base, 'sessions/s1/bilan/final'), { questions: [] });
    });

    await assertSucceeds(getDoc(doc(connecte(env, NOEMIE), 'sessions/s1/bilan/final')));
  });

  it('REFUS — un participant lit le bilan', async () => {
    await semer();
    await env.withSecurityRulesDisabled(async (contexte) => {
      const base = contexte.firestore();
      await setDoc(doc(base, `sessions/s1/participants/${JORDAN.uid}`), participant());
      await setDoc(doc(base, 'sessions/s1/bilan/final'), { questions: [] });
    });

    await assertFails(getDoc(doc(connecte(env, JORDAN), 'sessions/s1/bilan/final')));
  });

  it('REFUS — personne n’écrit le bilan, animatrice comprise', async () => {
    await semer();
    await assertFails(
      setDoc(doc(connecte(env, NOEMIE), 'sessions/s1/bilan/final'), { questions: [] }),
    );
  });
});

/**
 * Ce que ces tests protègent : la mise en page d'un écran projeté.
 *
 * Un nom sur deux lignes casse toute la liste ; un caractère invisible ne
 * s'affiche pas mais compte dans les trente-deux.
 */
describe('Session collective — nom d’affichage', () => {
  it('accepte les accents, les espaces et les traits d’union', async () => {
    await semer();
    await assertSucceeds(
      setDoc(
        doc(connecte(env, JORDAN), `sessions/s1/participants/${JORDAN.uid}`),
        participant({ nom: 'Marie-Charlotte de Villeneuve' }),
      ),
    );
  });

  for (const [libelle, nom] of [
    ['un retour à la ligne', 'Jordan\nFaye'],
    ['une tabulation', 'Jordan\tFaye'],
    ['un retour chariot', 'Jordan\rFaye'],
    ['un caractère de contrôle invisible', 'Jordan\u0007'],
  ] as [string, string][]) {
    it(`REFUS — ${libelle}`, async () => {
      await semer();
      await assertFails(
        setDoc(
          doc(connecte(env, JORDAN), `sessions/s1/participants/${JORDAN.uid}`),
          participant({ nom }),
        ),
      );
    });
  }
});
