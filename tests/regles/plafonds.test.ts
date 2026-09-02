import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest';

import {
  connecte,
  creerEnvironnement,
  formation,
  JORDAN,
  NOEMIE,
  question,
  reponse,
  session,
  texteDe,
} from './aide';

let env: RulesTestEnvironment;

type Document = Record<string, unknown>;

/** `nombre` identifiants distincts, tous de la même longueur. */
function idsDeLongueur(nombre: number, longueur: number): string[] {
  return Array.from({ length: nombre }, (_, index) => `${index}`.padStart(longueur, 'x'));
}

/** Question dont les options portent les identifiants fournis. */
function questionAOptions(cles: string[], bonnesReponses: string[]): Document {
  const options: Record<string, string> = {};
  for (const cle of cles) options[cle] = 'Libellé';
  return question({ type: 'qcm', options, ordreOptions: cles, bonnesReponses });
}

/** Identifiant d'utilisateur d'une longueur donnée. */
function compteDeLongueur(longueur: number, admin = true) {
  return { uid: texteDe(longueur), email: 'noemie@medere.fr', admin };
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

// --------------------------------------------------------------------------

describe('Plafonds — questions', () => {
  const chemin = (suffixe: string) => `questions/p-${suffixe}`;

  function ecrire(donnees: Document, suffixe: string) {
    return setDoc(doc(connecte(env, NOEMIE), chemin(suffixe)), donnees);
  }

  it('un énoncé de 500 caractères est accepté', async () => {
    await assertSucceeds(ecrire(question({ enonce: texteDe(500) }), 'enonce-ok'));
  });

  it('REFUS — un énoncé de 501 caractères', async () => {
    await assertFails(ecrire(question({ enonce: texteDe(501) }), 'enonce-ko'));
  });

  it('une explication de 1000 caractères est acceptée', async () => {
    await assertSucceeds(ecrire(question({ explication: texteDe(1000) }), 'expl-ok'));
  });

  it('REFUS — une explication de 1001 caractères', async () => {
    await assertFails(ecrire(question({ explication: texteDe(1001) }), 'expl-ko'));
  });

  it('un contexte de 1000 caractères est accepté', async () => {
    await assertSucceeds(
      ecrire(question({ type: 'scenario', contexte: texteDe(1000) }), 'ctx-ok'),
    );
  });

  it('REFUS — un contexte de 1001 caractères', async () => {
    await assertFails(ecrire(question({ type: 'scenario', contexte: texteDe(1001) }), 'ctx-ko'));
  });

  it('un thème de 60 caractères est accepté', async () => {
    await assertSucceeds(ecrire(question({ theme: texteDe(60) }), 'theme-ok'));
  });

  it('REFUS — un thème de 61 caractères', async () => {
    await assertFails(ecrire(question({ theme: texteDe(61) }), 'theme-ko'));
  });

  it("un auteur dont l'identifiant fait 128 caractères est accepté", async () => {
    const compte = compteDeLongueur(128);
    await assertSucceeds(
      setDoc(
        doc(connecte(env, compte), chemin('auteur-ok')),
        question({ creeePar: compte.uid }),
      ),
    );
  });

  it("REFUS — un auteur dont l'identifiant fait 129 caractères", async () => {
    const compte = compteDeLongueur(129);
    await assertFails(
      setDoc(
        doc(connecte(env, compte), chemin('auteur-ko')),
        question({ creeePar: compte.uid }),
      ),
    );
  });

  it('cinquante formations rattachées, soit 999 caractères cumulés, sont acceptées', async () => {
    await assertSucceeds(
      ecrire(question({ formationIds: idsDeLongueur(50, 19) }), 'formations-ok'),
    );
  });

  it('REFUS — soixante formations rattachées, soit 1199 caractères cumulés', async () => {
    await assertFails(ecrire(question({ formationIds: idsDeLongueur(60, 19) }), 'formations-ko'));
  });

  it('cinquante bonnes réponses, soit 999 caractères cumulés, sont acceptées', async () => {
    const cles = idsDeLongueur(60, 19);
    await assertSucceeds(ecrire(questionAOptions(cles, cles.slice(0, 50)), 'bonnes-ok'));
  });

  it('REFUS — soixante bonnes réponses, soit 1199 caractères cumulés', async () => {
    const cles = idsDeLongueur(60, 19);
    await assertFails(ecrire(questionAOptions(cles, cles), 'bonnes-ko'));
  });

  it('cent options, soit 1999 caractères d’identifiants cumulés, sont acceptées', async () => {
    const cles = idsDeLongueur(100, 19);
    await assertSucceeds(ecrire(questionAOptions(cles, [cles[0] as string]), 'options-ok'));
  });

  it('REFUS — cent une options, soit 2019 caractères d’identifiants cumulés', async () => {
    const cles = idsDeLongueur(101, 19);
    await assertFails(ecrire(questionAOptions(cles, [cles[0] as string]), 'options-ko'));
  });
});

// --------------------------------------------------------------------------

describe('Plafonds — formations', () => {
  function ecrire(donnees: Document, suffixe: string) {
    return setDoc(doc(connecte(env, NOEMIE), `formations/p-${suffixe}`), donnees);
  }

  it('un identifiant Airtable de 64 caractères est accepté', async () => {
    await assertSucceeds(ecrire(formation({ airtableId: texteDe(64) }), 'at-ok'));
  });

  it('REFUS — un identifiant Airtable de 65 caractères', async () => {
    await assertFails(ecrire(formation({ airtableId: texteDe(65) }), 'at-ko'));
  });

  it('un nom de formation de 200 caractères est accepté', async () => {
    await assertSucceeds(ecrire(formation({ nom: texteDe(200) }), 'nom-ok'));
  });

  it('REFUS — un nom de formation de 201 caractères', async () => {
    await assertFails(ecrire(formation({ nom: texteDe(201) }), 'nom-ko'));
  });

  it('une cible de 60 caractères est acceptée', async () => {
    await assertSucceeds(ecrire(formation({ cible: texteDe(60) }), 'cible-ok'));
  });

  it('REFUS — une cible de 61 caractères', async () => {
    await assertFails(ecrire(formation({ cible: texteDe(61) }), 'cible-ko'));
  });

  it('un format de 60 caractères est accepté', async () => {
    await assertSucceeds(ecrire(formation({ format: texteDe(60) }), 'format-ok'));
  });

  it('REFUS — un format de 61 caractères', async () => {
    await assertFails(ecrire(formation({ format: texteDe(61) }), 'format-ko'));
  });
});

// --------------------------------------------------------------------------

describe('Plafonds — réponses individuelles', () => {
  const CLES = idsDeLongueur(60, 19);

  async function semer(): Promise<void> {
    await env.withSecurityRulesDisabled(async (contexte) => {
      const base = contexte.firestore();
      // Deux questions publiées, dont les identifiants encadrent le plafond.
      await setDoc(doc(base, `questions/${texteDe(128)}`), question());
      await setDoc(doc(base, `questions/${texteDe(129)}`), question());
      await setDoc(
        doc(base, 'questions/q-large'),
        questionAOptions(CLES, [CLES[0] as string]),
      );
    });
  }

  function ecrire(donnees: Document, suffixe: string) {
    return setDoc(doc(connecte(env, JORDAN), `users/${JORDAN.uid}/reponses/${suffixe}`), donnees);
  }

  it("une réponse à une question dont l'identifiant fait 128 caractères est acceptée", async () => {
    await semer();
    await assertSucceeds(ecrire(reponse({ questionId: texteDe(128) }), 'qid-ok'));
  });

  it("REFUS — une réponse à une question dont l'identifiant fait 129 caractères", async () => {
    await semer();
    await assertFails(ecrire(reponse({ questionId: texteDe(129) }), 'qid-ko'));
  });

  it('cinquante options choisies, soit 999 caractères cumulés, sont acceptées', async () => {
    await semer();
    await assertSucceeds(
      ecrire(
        reponse({ questionId: 'q-large', optionsChoisies: CLES.slice(0, 50), correcte: false }),
        'sel-ok',
      ),
    );
  });

  it('REFUS — soixante options choisies, soit 1199 caractères cumulés', async () => {
    await semer();
    await assertFails(
      ecrire(reponse({ questionId: 'q-large', optionsChoisies: CLES, correcte: false }), 'sel-ko'),
    );
  });
});

// --------------------------------------------------------------------------

describe('Plafonds — sessions', () => {
  function ecrire(donnees: Document, suffixe: string) {
    return setDoc(doc(connecte(env, NOEMIE), `sessions/p-${suffixe}`), donnees);
  }

  it('un code de session de 12 caractères est accepté', async () => {
    await assertSucceeds(ecrire(session({ code: texteDe(12) }), 'code-ok'));
  });

  it('REFUS — un code de session de 13 caractères', async () => {
    await assertFails(ecrire(session({ code: texteDe(13) }), 'code-ko'));
  });

  it('deux cents questions en session, soit 3999 caractères cumulés, sont acceptées', async () => {
    await assertSucceeds(ecrire(session({ questionIds: idsDeLongueur(200, 19) }), 'qs-ok'));
  });

  it('REFUS — deux cent une questions en session, soit 4019 caractères cumulés', async () => {
    await assertFails(ecrire(session({ questionIds: idsDeLongueur(201, 19) }), 'qs-ko'));
  });

  it("une animatrice dont l'identifiant fait 128 caractères est acceptée", async () => {
    const compte = compteDeLongueur(128);
    await assertSucceeds(
      setDoc(
        doc(connecte(env, compte), 'sessions/p-anim-ok'),
        session({ animateurUid: compte.uid }),
      ),
    );
  });

  it("REFUS — une animatrice dont l'identifiant fait 129 caractères", async () => {
    const compte = compteDeLongueur(129);
    await assertFails(
      setDoc(
        doc(connecte(env, compte), 'sessions/p-anim-ko'),
        session({ animateurUid: compte.uid }),
      ),
    );
  });
});
