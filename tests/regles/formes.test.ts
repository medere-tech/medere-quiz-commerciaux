import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest';

import {
  connecte,
  creerEnvironnement,
  demain,
  HIER,
  identifiants,
  JORDAN,
  NOEMIE,
  question,
  reponse,
  utilisateur,
} from './aide';

let env: RulesTestEnvironment;

type Document = Record<string, unknown>;

/** Le même document, privé d'un champ : sert aux scénarios de champ manquant. */
function sans(document: Document, champ: string): Document {
  const copie = { ...document };
  delete copie[champ];
  return copie;
}

const OPTIONS_QCM = {
  a: 'Parodontie',
  b: 'Implantologie',
  c: 'Endodontie',
  d: 'Orthodontie',
};

const QCM_MULTIPLE = question({
  type: 'qcm',
  enonce: 'Quelles formations sont éligibles au DPC ?',
  options: OPTIONS_QCM,
  ordreOptions: ['a', 'b', 'c', 'd'],
  bonnesReponses: ['a', 'c'],
});

/** Question à `nombre` options, pour éprouver l'absence de plafond. */
function questionLarge(nombre: number): Document {
  const cles = identifiants(nombre);
  const options: Record<string, string> = {};
  for (const cle of cles) options[cle] = `Libellé ${cle}`;
  return question({
    type: 'qcm',
    options,
    ordreOptions: cles,
    bonnesReponses: [cles[cles.length - 1] as string],
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

async function semer(): Promise<void> {
  await env.withSecurityRulesDisabled(async (contexte) => {
    const base = contexte.firestore();
    await setDoc(doc(base, 'questions/q-vf'), question());
    await setDoc(doc(base, 'questions/q-qcm'), QCM_MULTIPLE);
    await setDoc(doc(base, 'questions/q-brouillon'), question({ statut: 'brouillon' }));
    await setDoc(doc(base, `users/${JORDAN.uid}`), utilisateur());
  });
}

// --------------------------------------------------------------------------

describe('Forme des questions', () => {
  const cheminNeuf = (suffixe: string) => `questions/nouvelle-${suffixe}`;

  it('une question vrai/faux conforme est acceptée', async () => {
    await assertSucceeds(setDoc(doc(connecte(env, NOEMIE), cheminNeuf('vf')), question()));
  });

  it('un QCM à plusieurs bonnes réponses, toutes présentes dans les options, est accepté', async () => {
    await assertSucceeds(setDoc(doc(connecte(env, NOEMIE), cheminNeuf('qcm')), QCM_MULTIPLE));
  });

  it('une mise en situation avec contexte renseigné est acceptée', async () => {
    await assertSucceeds(
      setDoc(
        doc(connecte(env, NOEMIE), cheminNeuf('scenario')),
        question({
          type: 'scenario',
          contexte: 'Un dentiste vient de terminer la formation Parodontie.',
        }),
      ),
    );
  });

  it('REFUS — explication vide', async () => {
    await assertFails(
      setDoc(doc(connecte(env, NOEMIE), cheminNeuf('e1')), question({ explication: '' })),
    );
  });

  it('REFUS — explication réduite à des espaces', async () => {
    await assertFails(
      setDoc(doc(connecte(env, NOEMIE), cheminNeuf('e2')), question({ explication: '   ' })),
    );
  });

  it('REFUS — énoncé vide', async () => {
    await assertFails(
      setDoc(doc(connecte(env, NOEMIE), cheminNeuf('e3')), question({ enonce: '' })),
    );
  });

  it('REFUS — type hors vf, qcm et scenario', async () => {
    await assertFails(
      setDoc(doc(connecte(env, NOEMIE), cheminNeuf('t1')), question({ type: 'ouverte' })),
    );
  });

  it('REFUS — formationIds vide', async () => {
    await assertFails(
      setDoc(doc(connecte(env, NOEMIE), cheminNeuf('f1')), question({ formationIds: [] })),
    );
  });

  it('REFUS — une formation rattachée deux fois', async () => {
    await assertFails(
      setDoc(
        doc(connecte(env, NOEMIE), cheminNeuf('f2')),
        question({ formationIds: ['formation-1', 'formation-1'] }),
      ),
    );
  });

  it('REFUS — un champ hors modèle', async () => {
    await assertFails(
      setDoc(
        doc(connecte(env, NOEMIE), cheminNeuf('c1')),
        question({ commentaireInterne: 'à revoir' }),
      ),
    );
  });

  it('REFUS — un champ du modèle manquant', async () => {
    await assertFails(
      setDoc(doc(connecte(env, NOEMIE), cheminNeuf('c2')), sans(question(), 'theme')),
    );
  });

  it('REFUS — un contexte renseigné sur une question vrai/faux', async () => {
    await assertFails(
      setDoc(
        doc(connecte(env, NOEMIE), cheminNeuf('x1')),
        question({ contexte: 'Une mise en situation qui n’a rien à faire ici.' }),
      ),
    );
  });

  it('REFUS — une mise en situation sans contexte', async () => {
    await assertFails(
      setDoc(
        doc(connecte(env, NOEMIE), cheminNeuf('x2')),
        question({ type: 'scenario', contexte: null }),
      ),
    );
  });

  it("REFUS — difficulté hors de l'échelle", async () => {
    await assertFails(
      setDoc(doc(connecte(env, NOEMIE), cheminNeuf('d1')), question({ difficulte: 4 })),
    );
  });

  it('REFUS — statut inconnu', async () => {
    await assertFails(
      setDoc(doc(connecte(env, NOEMIE), cheminNeuf('s1')), question({ statut: 'archivee' })),
    );
  });

  it("REFUS — une question créée au nom d'un autre auteur", async () => {
    await assertFails(
      setDoc(doc(connecte(env, NOEMIE), cheminNeuf('a1')), question({ creeePar: 'uid-quelquun' })),
    );
  });

  it("REFUS — une modification qui vide l'explication", async () => {
    await semer();
    await assertFails(
      updateDoc(doc(connecte(env, NOEMIE), 'questions/q-vf'), { explication: '' }),
    );
  });

  it("REFUS — une modification qui réécrit l'auteur", async () => {
    await semer();
    await assertFails(
      updateDoc(doc(connecte(env, NOEMIE), 'questions/q-vf'), { creeePar: `${NOEMIE.uid}-bis` }),
    );
  });

  it('une modification conforme est acceptée', async () => {
    await semer();
    await assertSucceeds(
      updateDoc(doc(connecte(env, NOEMIE), 'questions/q-vf'), {
        explication: 'Obligation triennale, sur trois années civiles.',
        modifieeLe: HIER,
      }),
    );
  });
});

describe('Traçabilité de la fiche source', () => {
  const cheminNeuf = (suffixe: string) => `questions/source-${suffixe}`;

  function ecrireQuestion(donnees: Document, suffixe: string) {
    return setDoc(doc(connecte(env, NOEMIE), cheminNeuf(suffixe)), donnees);
  }

  it('une question qui déclare sa fiche et sa version est acceptée', async () => {
    await assertSucceeds(
      ecrireQuestion(
        question({ sourceFiche: 'Argumentaire Endodontie', sourceVersion: '2026-08-14' }),
        'ok',
      ),
    );
  });

  it('REFUS — une question sans champ sourceFiche', async () => {
    await assertFails(ecrireQuestion(sans(question(), 'sourceFiche'), 'f1'));
  });

  it('REFUS — une question sans champ sourceVersion', async () => {
    await assertFails(ecrireQuestion(sans(question(), 'sourceVersion'), 'f2'));
  });

  it('REFUS — une fiche source vide', async () => {
    await assertFails(ecrireQuestion(question({ sourceFiche: '' }), 'f3'));
  });

  it('REFUS — une version de fiche vide', async () => {
    await assertFails(ecrireQuestion(question({ sourceVersion: '   ' }), 'f4'));
  });

  it("REFUS — une version de fiche qui n'est pas une chaîne", async () => {
    await assertFails(ecrireQuestion(question({ sourceVersion: 3 }), 'f5'));
  });

  it('la version de la fiche peut être mise à jour', async () => {
    await semer();
    await assertSucceeds(
      updateDoc(doc(connecte(env, NOEMIE), 'questions/q-vf'), { sourceVersion: 'v4' }),
    );
  });
});

// --------------------------------------------------------------------------

describe('Options et ordre d’affichage', () => {
  const cheminNeuf = (suffixe: string) => `questions/options-${suffixe}`;

  it('quarante options sont acceptées : le nombre n’est plus plafonné', async () => {
    await assertSucceeds(
      setDoc(doc(connecte(env, NOEMIE), cheminNeuf('40')), questionLarge(40)),
    );
  });

  it("l'ordre d'affichage peut différer de l'ordre des identifiants", async () => {
    await assertSucceeds(
      setDoc(
        doc(connecte(env, NOEMIE), cheminNeuf('ordre')),
        question({
          type: 'qcm',
          options: OPTIONS_QCM,
          ordreOptions: ['d', 'b', 'c', 'a'],
          bonnesReponses: ['a', 'c'],
        }),
      ),
    );
  });

  it('REFUS — une bonne réponse qui ne correspond à aucune option', async () => {
    await assertFails(
      setDoc(doc(connecte(env, NOEMIE), cheminNeuf('b1')), question({ bonnesReponses: ['z'] })),
    );
  });

  it('REFUS — un QCM dont une seule des deux bonnes réponses existe', async () => {
    await assertFails(
      setDoc(
        doc(connecte(env, NOEMIE), cheminNeuf('b2')),
        question({
          type: 'qcm',
          options: OPTIONS_QCM,
          ordreOptions: ['a', 'b', 'c', 'd'],
          bonnesReponses: ['a', 'z'],
        }),
      ),
    );
  });

  it('REFUS — aucune bonne réponse', async () => {
    await assertFails(
      setDoc(doc(connecte(env, NOEMIE), cheminNeuf('b3')), question({ bonnesReponses: [] })),
    );
  });

  it('REFUS — une bonne réponse répétée', async () => {
    await assertFails(
      setDoc(
        doc(connecte(env, NOEMIE), cheminNeuf('b4')),
        question({ bonnesReponses: ['a', 'a'] }),
      ),
    );
  });

  it("REFUS — une option absente de l'ordre d'affichage", async () => {
    await assertFails(
      setDoc(doc(connecte(env, NOEMIE), cheminNeuf('o1')), question({ ordreOptions: ['a'] })),
    );
  });

  it("REFUS — un identifiant inconnu dans l'ordre d'affichage", async () => {
    await assertFails(
      setDoc(
        doc(connecte(env, NOEMIE), cheminNeuf('o2')),
        question({ ordreOptions: ['a', 'z'] }),
      ),
    );
  });

  it("REFUS — un identifiant répété dans l'ordre d'affichage", async () => {
    await assertFails(
      setDoc(
        doc(connecte(env, NOEMIE), cheminNeuf('o3')),
        question({ ordreOptions: ['a', 'a'] }),
      ),
    );
  });

  it("REFUS — un ordre d'affichage vide", async () => {
    await assertFails(
      setDoc(doc(connecte(env, NOEMIE), cheminNeuf('o4')), question({ ordreOptions: [] })),
    );
  });

  it("REFUS — un ordre d'affichage plus long que les options", async () => {
    await assertFails(
      setDoc(
        doc(connecte(env, NOEMIE), cheminNeuf('o5')),
        question({ ordreOptions: ['a', 'b', 'b'] }),
      ),
    );
  });

  it('REFUS — une seule option', async () => {
    await assertFails(
      setDoc(
        doc(connecte(env, NOEMIE), cheminNeuf('o6')),
        question({ options: { a: 'Vrai' }, ordreOptions: ['a'] }),
      ),
    );
  });

  it('REFUS — des options fournies sous forme de liste', async () => {
    await assertFails(
      setDoc(
        doc(connecte(env, NOEMIE), cheminNeuf('o7')),
        question({ options: [{ id: 'a', texte: 'Vrai' }] }),
      ),
    );
  });
});

// --------------------------------------------------------------------------

describe('Forme des réponses individuelles', () => {
  const chemin = (suffixe: string) => `users/${JORDAN.uid}/reponses/${suffixe}`;

  it('une réponse conforme, au verdict exact, est acceptée', async () => {
    await semer();
    await assertSucceeds(
      setDoc(doc(connecte(env, JORDAN), chemin('r1')), reponse({ questionId: 'q-vf' })),
    );
  });

  it('une bonne réponse annoncée correcte est acceptée', async () => {
    await semer();
    await assertSucceeds(
      setDoc(
        doc(connecte(env, JORDAN), chemin('r2')),
        reponse({ questionId: 'q-vf', optionsChoisies: ['a'], correcte: true }),
      ),
    );
  });

  it("un QCM multiple dont l'ensemble sélectionné est exact est accepté", async () => {
    await semer();
    await assertSucceeds(
      setDoc(
        doc(connecte(env, JORDAN), chemin('r3')),
        reponse({ questionId: 'q-qcm', optionsChoisies: ['c', 'a'], correcte: true }),
      ),
    );
  });

  it('une réponse partielle déclarée fausse est acceptée', async () => {
    await semer();
    await assertSucceeds(
      setDoc(
        doc(connecte(env, JORDAN), chemin('r4')),
        reponse({ questionId: 'q-qcm', optionsChoisies: ['a'], correcte: false }),
      ),
    );
  });

  it('une absence de réponse déclarée fausse est acceptée', async () => {
    await semer();
    await assertSucceeds(
      setDoc(
        doc(connecte(env, JORDAN), chemin('r5')),
        reponse({ questionId: 'q-vf', optionsChoisies: [], correcte: false }),
      ),
    );
  });

  it('REFUS — une réponse partielle à un QCM multiple déclarée correcte', async () => {
    await semer();
    await assertFails(
      setDoc(
        doc(connecte(env, JORDAN), chemin('f1')),
        reponse({ questionId: 'q-qcm', optionsChoisies: ['a'], correcte: true }),
      ),
    );
  });

  it('REFUS — une sélection trop large déclarée correcte', async () => {
    await semer();
    await assertFails(
      setDoc(
        doc(connecte(env, JORDAN), chemin('f2')),
        reponse({ questionId: 'q-qcm', optionsChoisies: ['a', 'b', 'c'], correcte: true }),
      ),
    );
  });

  it('REFUS — une mauvaise réponse déclarée correcte', async () => {
    await semer();
    await assertFails(
      setDoc(
        doc(connecte(env, JORDAN), chemin('f3')),
        reponse({ questionId: 'q-vf', optionsChoisies: ['b'], correcte: true }),
      ),
    );
  });

  it('REFUS — une réponse exacte déclarée fausse', async () => {
    await semer();
    await assertFails(
      setDoc(
        doc(connecte(env, JORDAN), chemin('f4')),
        reponse({ questionId: 'q-qcm', optionsChoisies: ['a', 'c'], correcte: false }),
      ),
    );
  });

  it('REFUS — une option choisie qui n’existe pas dans la question', async () => {
    await semer();
    await assertFails(
      setDoc(
        doc(connecte(env, JORDAN), chemin('f5')),
        reponse({ questionId: 'q-vf', optionsChoisies: ['z'], correcte: false }),
      ),
    );
  });

  it('REFUS — une option inventée glissée dans une sélection par ailleurs exacte', async () => {
    await semer();
    await assertFails(
      setDoc(
        doc(connecte(env, JORDAN), chemin('f6')),
        reponse({ questionId: 'q-qcm', optionsChoisies: ['a', 'c', 'z'], correcte: false }),
      ),
    );
  });

  it('REFUS — une réponse qui référence une question inexistante', async () => {
    await semer();
    await assertFails(
      setDoc(doc(connecte(env, JORDAN), chemin('f7')), reponse({ questionId: 'q-fantome' })),
    );
  });

  it('REFUS — une réponse qui référence une question en brouillon', async () => {
    await semer();
    await assertFails(
      setDoc(doc(connecte(env, JORDAN), chemin('f8')), reponse({ questionId: 'q-brouillon' })),
    );
  });

  it('REFUS — un champ hors modèle', async () => {
    await semer();
    await assertFails(
      setDoc(
        doc(connecte(env, JORDAN), chemin('f9')),
        reponse({ questionId: 'q-vf', tempsDeReponse: 12 }),
      ),
    );
  });

  it('REFUS — un champ du modèle manquant', async () => {
    await semer();
    await assertFails(
      setDoc(
        doc(connecte(env, JORDAN), chemin('f10')),
        sans(reponse({ questionId: 'q-vf' }), 'origine'),
      ),
    );
  });

  it("REFUS — un verdict qui n'est pas un booléen", async () => {
    await semer();
    await assertFails(
      setDoc(
        doc(connecte(env, JORDAN), chemin('f11')),
        reponse({ questionId: 'q-vf', correcte: 'false' }),
      ),
    );
  });

  it('REFUS — une origine inconnue', async () => {
    await semer();
    await assertFails(
      setDoc(
        doc(connecte(env, JORDAN), chemin('f12')),
        reponse({ questionId: 'q-vf', origine: 'import' }),
      ),
    );
  });

  it('REFUS — une réponse horodatée dans le futur', async () => {
    await semer();
    await assertFails(
      setDoc(
        doc(connecte(env, JORDAN), chemin('f13')),
        reponse({ questionId: 'q-vf', repondueLe: demain() }),
      ),
    );
  });

  it('REFUS — une option choisie deux fois', async () => {
    await semer();
    await assertFails(
      setDoc(
        doc(connecte(env, JORDAN), chemin('f14')),
        reponse({ questionId: 'q-vf', optionsChoisies: ['b', 'b'] }),
      ),
    );
  });

  it("REFUS — une sélection qui n'est pas une liste", async () => {
    await semer();
    await assertFails(
      setDoc(
        doc(connecte(env, JORDAN), chemin('f15')),
        reponse({ questionId: 'q-vf', optionsChoisies: 'b' }),
      ),
    );
  });
});

// --------------------------------------------------------------------------

describe("Progression de l'utilisateur", () => {
  const chemin = `users/${JORDAN.uid}`;

  it('trois étoiles gagnées en une écriture sont acceptées', async () => {
    await semer();
    await assertSucceeds(
      updateDoc(doc(connecte(env, JORDAN), chemin), { etoiles: 7, seriesTerminees: 3 }),
    );
  });

  it('une série close sans étoile est acceptée', async () => {
    await semer();
    await assertSucceeds(
      updateDoc(doc(connecte(env, JORDAN), chemin), { seriesTerminees: 3, vuLe: HIER }),
    );
  });

  it('la seule mise à jour de la dernière visite est acceptée', async () => {
    await semer();
    await assertSucceeds(updateDoc(doc(connecte(env, JORDAN), chemin), { vuLe: HIER }));
  });

  it('REFUS — quatre étoiles gagnées en une écriture', async () => {
    await semer();
    await assertFails(updateDoc(doc(connecte(env, JORDAN), chemin), { etoiles: 8 }));
  });

  it("REFUS — un total d'étoiles en baisse", async () => {
    await semer();
    await assertFails(updateDoc(doc(connecte(env, JORDAN), chemin), { etoiles: 3 }));
  });

  it("REFUS — un total d'étoiles qui n'est pas un entier", async () => {
    await semer();
    await assertFails(updateDoc(doc(connecte(env, JORDAN), chemin), { etoiles: 5.5 }));
  });

  it("REFUS — deux séries closes d'un coup", async () => {
    await semer();
    await assertFails(updateDoc(doc(connecte(env, JORDAN), chemin), { seriesTerminees: 4 }));
  });

  it('REFUS — un compteur de séries en baisse', async () => {
    await semer();
    await assertFails(updateDoc(doc(connecte(env, JORDAN), chemin), { seriesTerminees: 1 }));
  });

  it('REFUS — un champ hors modèle ajouté au document utilisateur', async () => {
    await semer();
    await assertFails(
      updateDoc(doc(connecte(env, JORDAN), chemin), { preferenceAffichage: 'sombre' }),
    );
  });

  it('REFUS — une dernière visite datée dans le futur', async () => {
    await semer();
    await assertFails(updateDoc(doc(connecte(env, JORDAN), chemin), { vuLe: demain() }));
  });
});
