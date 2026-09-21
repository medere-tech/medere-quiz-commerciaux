import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest';

import {
  anonyme,
  connecte,
  creerEnvironnement,
  demain,
  EXTERNE,
  HIER,
  JORDAN,
  MAINTENANT,
  NOEMIE,
  question,
  participant,
  reponseSession,
  session,
  SOPHIE,
  texteDe,
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
    await assertSucceeds(updateDoc(doc(admin, 'sessions/s2'), { revelee: true }));
    // Révéler puis avancer sont deux gestes, et le second repose l'échéance :
    // les réunir en une écriture, comme le faisait ce test, ne correspond à
    // rien de ce que le dépôt exécute.
    await assertSucceeds(
      updateDoc(doc(admin, 'sessions/s2'), {
        indexCourant: 1,
        revelee: false,
        questionOuverteLe: MAINTENANT,
      }),
    );
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

  /*
   * Ce que la séance annonce d'elle-même.
   *
   * Le titre est projeté sur un mur : borné, sans caractère de contrôle, et
   * jamais vide — un `<h1>` blanc devant dix personnes est un défaut, pas un
   * cas limite. La description, elle, est facultative.
   */
  it('REFUS — une séance sans titre', async () => {
    await assertFails(creerSession(session({ titre: '' }), 's-titre-vide'));
  });

  it('REFUS — un titre qui n’est que des espaces', async () => {
    await assertFails(creerSession(session({ titre: '   ' }), 's-titre-blanc'));
  });

  it('REFUS — un titre au-delà de soixante caractères', async () => {
    await assertFails(creerSession(session({ titre: texteDe(61) }), 's-titre-long'));
  });

  it('accepte un titre de soixante caractères exactement', async () => {
    await assertSucceeds(creerSession(session({ titre: texteDe(60) }), 's-titre-borne'));
  });

  it('REFUS — un titre sur deux lignes, qui casserait la mise en page', async () => {
    await assertFails(
      creerSession(
        session({ titre: 'Objections\nsur les classes' }),
        's-titre-lignes',
      ),
    );
  });

  it('accepte une description vide : elle est facultative', async () => {
    await assertSucceeds(creerSession(session({ description: '' }), 's-desc-vide'));
  });

  it('REFUS — une description au-delà de cent soixante caractères', async () => {
    await assertFails(creerSession(session({ description: texteDe(161) }), 's-desc-longue'));
  });

  it('REFUS — un nom d’animatrice au-delà de la borne d’écran projeté', async () => {
    await assertFails(creerSession(session({ animateurNom: texteDe(33) }), 's-anim-long'));
  });

  it('REFUS — une séance sans nom d’animatrice', async () => {
    await assertFails(creerSession(session({ animateurNom: '' }), 's-anim-vide'));
  });

  /*
   * `ouverteLe` vaut `null` tant que la séance est en attente : c'est le cas
   * normal d'une séance composée le mardi pour le jeudi.
   */
  it('accepte une séance préparée, sans heure d’ouverture', async () => {
    await assertSucceeds(
      creerSession(session({ statut: 'attente', ouverteLe: null }), 's-attente'),
    );
  });

  it('REFUS — une heure d’ouverture dans le futur', async () => {
    await assertFails(creerSession(session({ ouverteLe: demain() }), 's-ouverte-futur'));
  });

  it('REFUS — un démarrage qui n’est pas un booléen', async () => {
    await assertFails(creerSession(session({ demarree: 'oui' }), 's-dem'));
  });

  it('accepte une séance déclarée pour dix personnes', async () => {
    await assertSucceeds(creerSession(session({ effectifAttendu: 10 }), 's-eff-10'));
  });

  it('accepte un effectif non déclaré : zéro vaut « on ne sait pas »', async () => {
    await assertSucceeds(creerSession(session({ effectifAttendu: 0 }), 's-eff-0'));
  });

  it('REFUS — un effectif négatif', async () => {
    await assertFails(creerSession(session({ effectifAttendu: -1 }), 's-eff-neg'));
  });

  it('REFUS — un effectif hors de toute salle réelle', async () => {
    await assertFails(creerSession(session({ effectifAttendu: 501 }), 's-eff-max'));
  });

  it('REFUS — un effectif qui n’est pas un entier', async () => {
    await assertFails(creerSession(session({ effectifAttendu: 8.5 }), 's-eff-frac'));
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
  /*
   * ------------------------------------------------------------------
   * Une séance abandonnée efface ses réponses.
   *
   * Elles ne servaient qu'au classement, et il n'y en aura pas. Trois verrous :
   * l'animatrice de cette séance et personne d'autre, sur une séance
   * `abandonnee` et pas une autre, jamais sur une séance terminée — dont le
   * classement se calcule précisément à partir de ces réponses.
   *
   * En production c'est la Cloud Function qui efface, par le SDK Admin, donc
   * hors règles. Ces cas disent qui *aurait* le droit, et ferment la porte à
   * tous les autres.
   * ------------------------------------------------------------------
   */
  it('l’animatrice efface une réponse d’une séance abandonnée', async () => {
    await semer();
    await env.withSecurityRulesDisabled(async (contexte) => {
      await updateDoc(doc(contexte.firestore(), 'sessions/s1'), { statut: 'abandonnee' });
    });

    await assertSucceeds(
      deleteDoc(doc(connecte(env, NOEMIE), `sessions/s1/reponses/${SOPHIE.uid}_q-vf`)),
    );
  });

  it('REFUS — effacer une réponse d’une séance terminée', async () => {
    await semer();
    await env.withSecurityRulesDisabled(async (contexte) => {
      await updateDoc(doc(contexte.firestore(), 'sessions/s1'), { statut: 'terminee' });
    });

    // Le classement se calcule à partir de ces réponses : les retirer ici
    // reviendrait à retirer le sol sous ses propres pieds.
    await assertFails(
      deleteDoc(doc(connecte(env, NOEMIE), `sessions/s1/reponses/${SOPHIE.uid}_q-vf`)),
    );
  });

  it('REFUS — effacer une réponse d’une séance en cours', async () => {
    await semer();
    await assertFails(
      deleteDoc(doc(connecte(env, NOEMIE), `sessions/s1/reponses/${SOPHIE.uid}_q-vf`)),
    );
  });

  it('REFUS — un commercial efface une réponse, même la sienne', async () => {
    await semer();
    await env.withSecurityRulesDisabled(async (contexte) => {
      const base = contexte.firestore();
      await setDoc(
        doc(base, `sessions/s1/reponses/${JORDAN.uid}_q-vf`),
        reponseSession(JORDAN.uid, { questionId: 'q-vf' }),
      );
      await updateDoc(doc(base, 'sessions/s1'), { statut: 'abandonnee' });
    });

    await assertFails(
      deleteDoc(doc(connecte(env, JORDAN), `sessions/s1/reponses/${JORDAN.uid}_q-vf`)),
    );
  });

  it('REFUS — une autre animatrice efface les réponses de cette séance', async () => {
    await semer();
    await env.withSecurityRulesDisabled(async (contexte) => {
      await updateDoc(doc(contexte.firestore(), 'sessions/s1'), { statut: 'abandonnee' });
    });

    await assertFails(
      deleteDoc(doc(connecte(env, AUTRE_ADMIN), `sessions/s1/reponses/${SOPHIE.uid}_q-vf`)),
    );
  });

  /*
   * **La progression individuelle ne bouge pas, et ne peut pas bouger.**
   * C'est l'autre moitié de la promesse : ces réponses étaient réelles.
   */
  it('REFUS — effacer une réponse de la progression, même la sienne', async () => {
    await semer();
    await env.withSecurityRulesDisabled(async (contexte) => {
      await setDoc(doc(contexte.firestore(), `users/${JORDAN.uid}/reponses/q-vf_1`), {
        questionId: 'q-vf',
        correcte: true,
        optionsChoisies: ['a'],
        origine: 'session',
        repondueLe: HIER,
      });
    });

    await assertFails(
      deleteDoc(doc(connecte(env, JORDAN), `users/${JORDAN.uid}/reponses/q-vf_1`)),
    );
  });

  it('un commercial se déclare présent pendant la séance', async () => {
    await semer();
    await assertSucceeds(
      setDoc(
        doc(connecte(env, JORDAN), `sessions/s1/participants/${JORDAN.uid}`),
        participant(),
      ),
    );
  });

  /*
   * En salle ou en visio.
   *
   * La séance est hybride : une partie de la pièce suit par visioconférence et
   * voit l'écran projeté avec plusieurs secondes de retard. L'animatrice doit
   * savoir qui est devant elle, et chacun le déclare pour lui-même — comme son
   * nom et sa couleur, jamais pour quelqu'un d'autre.
   */
  it('un commercial se déclare en visio', async () => {
    await semer();
    await assertSucceeds(
      setDoc(
        doc(connecte(env, JORDAN), `sessions/s1/participants/${JORDAN.uid}`),
        participant({ presence: 'visio' }),
      ),
    );
  });

  it('REFUS — un lieu de présence inconnu', async () => {
    await semer();
    await assertFails(
      setDoc(
        doc(connecte(env, JORDAN), `sessions/s1/participants/${JORDAN.uid}`),
        participant({ presence: 'terrasse' }),
      ),
    );
  });

  it('REFUS — un marqueur sans lieu de présence', async () => {
    await semer();
    await assertFails(
      setDoc(
        doc(connecte(env, JORDAN), `sessions/s1/participants/${JORDAN.uid}`),
        sans(participant(), 'presence'),
      ),
    );
  });

  it('le lieu se corrige en cours de séance : on change de pièce', async () => {
    await semer();
    const jordan = connecte(env, JORDAN);
    await assertSucceeds(
      setDoc(
        doc(jordan, `sessions/s1/participants/${JORDAN.uid}`),
        participant({ presence: 'visio' }),
      ),
    );
    await assertSucceeds(
      setDoc(
        doc(jordan, `sessions/s1/participants/${JORDAN.uid}`),
        participant({ presence: 'salle' }),
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

  /*
   * ------------------------------------------------------------------
   * « Déjà dans la salle » : la seule collection nominative de l'outil.
   *
   * L'écran d'accès annonce les présents avant qu'on ait rejoint. Cela exige
   * `list` pour quelqu'un qui n'est ni l'animatrice ni déjà présent — et un
   * compteur ne coûterait pas moins cher : une agrégation `count()` réclame
   * exactement la même permission.
   *
   * **La clause de statut est ce qui rend l'ouverture acceptable**, et c'est
   * elle que ces tests protègent. Sans elle, chaque séance passée deviendrait
   * une archive permanente de qui était là quel jeudi — exactement ce que la
   * règle jumelle interdit sur la liste des réponses.
   * ------------------------------------------------------------------
   */
  it('un commercial qui n’a pas encore rejoint lit la salle pendant la séance', async () => {
    await semer();
    await env.withSecurityRulesDisabled(async (contexte) => {
      await setDoc(
        doc(contexte.firestore(), `sessions/s1/participants/${SOPHIE.uid}`),
        participant({ nom: 'Sophie' }),
      );
    });

    await assertSucceeds(getDocs(collection(connecte(env, JORDAN), 'sessions/s1/participants')));
  });

  it('la salle se lit aussi pendant une pause : c’est là qu’un retardataire arrive', async () => {
    await semer();
    await env.withSecurityRulesDisabled(async (contexte) => {
      await updateDoc(doc(contexte.firestore(), 'sessions/s1'), { statut: 'pause' });
    });

    await assertSucceeds(getDocs(collection(connecte(env, JORDAN), 'sessions/s1/participants')));
  });

  it('REFUS — la salle ne se lit plus une fois la séance terminée', async () => {
    await semer();
    await env.withSecurityRulesDisabled(async (contexte) => {
      const base = contexte.firestore();
      await setDoc(doc(base, `sessions/s1/participants/${JORDAN.uid}`), participant());
      await updateDoc(doc(base, 'sessions/s1'), { statut: 'terminee' });
    });

    // Même un présent : la liste nominative meurt avec la séance, pour tout le
    // monde sauf l'animatrice.
    await assertFails(getDocs(collection(connecte(env, JORDAN), 'sessions/s1/participants')));
  });

  it('REFUS — la salle ne se lit plus une fois la séance abandonnée', async () => {
    await semer();
    await env.withSecurityRulesDisabled(async (contexte) => {
      await updateDoc(doc(contexte.firestore(), 'sessions/s1'), { statut: 'abandonnee' });
    });

    await assertFails(getDocs(collection(connecte(env, JORDAN), 'sessions/s1/participants')));
  });

  it('REFUS — un utilisateur hors domaine ne lit jamais la salle', async () => {
    await semer();
    await assertFails(getDocs(collection(connecte(env, EXTERNE), 'sessions/s1/participants')));
  });

  it('l’animatrice lit la salle même après la fin', async () => {
    await semer();
    await env.withSecurityRulesDisabled(async (contexte) => {
      await updateDoc(doc(contexte.firestore(), 'sessions/s1'), { statut: 'terminee' });
    });

    await assertSucceeds(getDocs(collection(connecte(env, NOEMIE), 'sessions/s1/participants')));
  });

  /*
   * **Lire la salle ne fait entrer personne.** C'est la garantie qui permet
   * d'ouvrir la lecture sans toucher au classement : la barrière est un
   * `exists()` sur son propre marqueur, et poser ce marqueur reste réservé à
   * son propriétaire, sur une séance ouverte.
   */
  it('REFUS — avoir lu la salle ne donne pas accès au classement', async () => {
    await semer();
    await env.withSecurityRulesDisabled(async (contexte) => {
      const base = contexte.firestore();
      await setDoc(
        doc(base, `sessions/s1/participants/${SOPHIE.uid}`),
        participant({ nom: 'Sophie' }),
      );
      await setDoc(doc(base, 'sessions/s1/classement/final'), { rangs: [] });
    });

    const jordan = connecte(env, JORDAN);
    await assertSucceeds(getDocs(collection(jordan, 'sessions/s1/participants')));
    await assertFails(getDoc(doc(jordan, 'sessions/s1/classement/final')));
  });

  /*
   * ------------------------------------------------------------------
   * La salle d'attente : lire sa salle AVANT le lancement.
   *
   * **Vérifié plutôt que supposé.** La règle ouvre `list` au domaine seulement
   * pendant `encours` et `pause` — une séance `attente` n'est ni l'un ni
   * l'autre. L'animatrice passe par la première branche, `estAnimateur()`, qui
   * ne regarde pas le statut ; mais c'est exactement le genre de raisonnement
   * qui se révèle faux en production, et l'écran de salle d'attente en dépend
   * entièrement.
   * ------------------------------------------------------------------
   */
  it('l’animatrice lit sa salle sur une séance encore en attente', async () => {
    await semer();
    await env.withSecurityRulesDisabled(async (contexte) => {
      await updateDoc(doc(contexte.firestore(), 'sessions/s1'), {
        statut: 'attente',
        demarree: false,
      });
    });

    await assertSucceeds(getDocs(collection(connecte(env, NOEMIE), 'sessions/s1/participants')));
  });

  it('REFUS — un commercial ne lit pas la salle d’une séance en attente', async () => {
    await semer();
    await env.withSecurityRulesDisabled(async (contexte) => {
      await updateDoc(doc(contexte.firestore(), 'sessions/s1'), {
        statut: 'attente',
        demarree: false,
      });
    });

    // La séance n'est pas ouverte : rien à y voir, pas même pour le domaine.
    await assertFails(getDocs(collection(connecte(env, JORDAN), 'sessions/s1/participants')));
  });

  it('l’animatrice pousse la première question depuis la salle d’attente', async () => {
    await semer();
    await assertSucceeds(
      updateDoc(doc(connecte(env, NOEMIE), 'sessions/s1'), {
        demarree: true,
        questionOuverteLe: MAINTENANT,
      }),
    );
  });

  it('REFUS — un commercial démarre la séance', async () => {
    await semer();
    await assertFails(
      updateDoc(doc(connecte(env, JORDAN), 'sessions/s1'), { demarree: true }),
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
    // La reprise repose l'échéance : sans cela la salle rouvrirait sur un
    // chronomètre périmé, et les règles le refusent désormais.
    await assertSucceeds(
      updateDoc(doc(base, 'sessions/s1'), { statut: 'encours', questionOuverteLe: MAINTENANT }),
    );
  });

  it('REFUS — un participant suspend la séance', async () => {
    await semer();
    await assertFails(
      updateDoc(doc(connecte(env, JORDAN), 'sessions/s1'), { statut: 'pause' }),
    );
  });
});

/**
 * Ce que ces tests protègent : le chronomètre reposé à chaque ouverture du vote.
 *
 * **Ils existent à cause d'un défaut que les règles autorisaient.** En séance
 * réelle, le vote a été rouvert sans reposer `questionOuverteLe` : la salle a
 * retrouvé sa question avec une échéance déjà dépassée, donc « temps écoulé »
 * sur un vote qu'on venait de lui rendre. Les règles permettaient ce champ sans
 * l'exiger — aucun des tests de règles ne pouvait voir son absence.
 *
 * La contrainte porte sur les trois gestes qui ouvrent le vote, et sur eux
 * seuls. C'est le genre d'invariant qu'une règle sait exprimer, et il vaut
 * mieux qu'il soit tenu en production que seulement dans un test.
 */
describe('le chronomètre d’une séance', () => {
  it('REFUS — changer de question sans reposer l’échéance', async () => {
    await semer();
    await assertFails(
      updateDoc(doc(connecte(env, NOEMIE), 'sessions/s1'), {
        indexCourant: 1,
        revelee: false,
        repartition: [],
        repondants: 0,
      }),
    );
  });

  it('changer de question en reposant l’échéance', async () => {
    await semer();
    await assertSucceeds(
      updateDoc(doc(connecte(env, NOEMIE), 'sessions/s1'), {
        indexCourant: 1,
        revelee: false,
        repartition: [],
        repondants: 0,
        questionOuverteLe: MAINTENANT,
      }),
    );
  });

  it('REFUS — rouvrir le vote sans reposer l’échéance', async () => {
    await semer();
    await env.withSecurityRulesDisabled(async (contexte) => {
      await updateDoc(doc(contexte.firestore(), 'sessions/s1'), { revelee: true });
    });

    await assertFails(
      updateDoc(doc(connecte(env, NOEMIE), 'sessions/s1'), { revelee: false, repartition: [] }),
    );
  });

  it('rouvrir le vote en reposant l’échéance', async () => {
    await semer();
    await env.withSecurityRulesDisabled(async (contexte) => {
      await updateDoc(doc(contexte.firestore(), 'sessions/s1'), { revelee: true });
    });

    await assertSucceeds(
      updateDoc(doc(connecte(env, NOEMIE), 'sessions/s1'), {
        revelee: false,
        repartition: [],
        questionOuverteLe: MAINTENANT,
      }),
    );
  });

  it('REFUS — lancer une séance préparée sans reposer l’échéance', async () => {
    await semer();
    await env.withSecurityRulesDisabled(async (contexte) => {
      await updateDoc(doc(contexte.firestore(), 'sessions/s1'), { statut: 'attente' });
    });

    await assertFails(
      updateDoc(doc(connecte(env, NOEMIE), 'sessions/s1'), { statut: 'encours' }),
    );
  });

  it('lancer une séance préparée en reposant l’échéance', async () => {
    await semer();
    await env.withSecurityRulesDisabled(async (contexte) => {
      await updateDoc(doc(contexte.firestore(), 'sessions/s1'), { statut: 'attente' });
    });

    await assertSucceeds(
      updateDoc(doc(connecte(env, NOEMIE), 'sessions/s1'), {
        statut: 'encours',
        questionOuverteLe: MAINTENANT,
      }),
    );
  });

  it('REFUS — réécrire le même instant ne compte pas pour une ouverture', async () => {
    await semer();
    await assertFails(
      updateDoc(doc(connecte(env, NOEMIE), 'sessions/s1'), {
        indexCourant: 1,
        revelee: false,
        repartition: [],
        repondants: 0,
        // La valeur déjà en place : rien ne change, l'échéance reste périmée.
        questionOuverteLe: HIER,
      }),
    );
  });

  it('révéler, mettre en pause, terminer et abandonner n’exigent rien', async () => {
    await semer();
    const base = connecte(env, NOEMIE);
    await assertSucceeds(
      updateDoc(doc(base, 'sessions/s1'), { revelee: true, repartition: [3, 1], repondants: 4 }),
    );
    await assertSucceeds(updateDoc(doc(base, 'sessions/s1'), { statut: 'pause' }));
    await assertSucceeds(updateDoc(doc(base, 'sessions/s1'), { statut: 'terminee' }));
    await assertSucceeds(updateDoc(doc(base, 'sessions/s1'), { statut: 'abandonnee' }));
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
