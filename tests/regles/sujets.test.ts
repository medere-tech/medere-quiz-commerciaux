import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest';

import {
  connecte,
  creerEnvironnement,
  EXTERNE,
  formation,
  HIER,
  JORDAN,
  NOEMIE,
  texteDe,
} from './aide';

/**
 * Ce que ces tests protègent : le rattachement d'une fiche à son sujet, le
 * miroir de la table Sujets, et la présentation d'un sujet — la seule donnée
 * de ce lot que l'équipe saisit elle-même.
 *
 * La présentation vit à part de `sujets/`, que la synchronisation réécrit
 * chaque nuit. Ses deux garanties se vérifient ici : seul un administrateur
 * l'écrit, et l'auteur qu'elle affiche est celui du jeton, pas celui qu'on
 * déclare.
 */

const SUJET = 'recSujetParodont1';

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

function sujet(remplacements: Record<string, unknown> = {}) {
  return { airtableId: SUJET, nom: 'Parodontie', actif: true, syncLe: HIER, ...remplacements };
}

function presentation(remplacements: Record<string, unknown> = {}) {
  return {
    url: 'https://docs.google.com/presentation/d/abc/edit',
    presenteeLe: Timestamp.fromDate(HIER),
    presentePar: NOEMIE.nom,
    majLe: serverTimestamp(),
    ...remplacements,
  };
}

describe('Formations — le sujet d’une fiche', () => {
  it('une fiche rattachée à un sujet', async () => {
    await assertSucceeds(setDoc(doc(connecte(env, NOEMIE), 'formations/f1'), formation()));
  });

  it('une fiche sans sujet, avec `null`', async () => {
    await assertSucceeds(
      setDoc(doc(connecte(env, NOEMIE), 'formations/f2'), formation({ sujetId: null })),
    );
  });

  it('REFUS — une fiche sans le champ : un document d’avant ce modèle', async () => {
    const sansSujet = formation();
    delete sansSujet.sujetId;
    await assertFails(setDoc(doc(connecte(env, NOEMIE), 'formations/f3'), sansSujet));
  });

  it('REFUS — un sujet qui n’a pas la forme d’un enregistrement Airtable', async () => {
    await assertFails(
      setDoc(doc(connecte(env, NOEMIE), 'formations/f4'), formation({ sujetId: 'COVID' })),
    );
  });
});

describe('Sujets — le miroir de la table Sujets', () => {
  it('un commercial du domaine lit un sujet', async () => {
    await env.withSecurityRulesDisabled(async (contexte) => {
      await setDoc(doc(contexte.firestore(), `sujets/${SUJET}`), sujet());
    });
    await assertSucceeds(getDoc(doc(connecte(env, JORDAN), `sujets/${SUJET}`)));
  });

  it('REFUS — hors du domaine, aucun sujet', async () => {
    await assertFails(getDoc(doc(connecte(env, EXTERNE), `sujets/${SUJET}`)));
  });

  it('un administrateur écrit un sujet conforme', async () => {
    await assertSucceeds(setDoc(doc(connecte(env, NOEMIE), `sujets/${SUJET}`), sujet()));
  });

  it('REFUS — un commercial n’écrit pas de sujet', async () => {
    await assertFails(setDoc(doc(connecte(env, JORDAN), `sujets/${SUJET}`), sujet()));
  });

  it('REFUS — un sujet rangé sous un autre identifiant que le sien', async () => {
    await assertFails(
      setDoc(doc(connecte(env, NOEMIE), 'sujets/recSujetAutre0001'), sujet()),
    );
  });

  it('REFUS — un sujet qui porte un lien de présentation : il serait effacé chaque nuit', async () => {
    await assertFails(
      setDoc(
        doc(connecte(env, NOEMIE), `sujets/${SUJET}`),
        sujet({ presentation: 'https://docs.google.com/presentation/d/abc' }),
      ),
    );
  });

  it('REFUS — un nom vide', async () => {
    await assertFails(setDoc(doc(connecte(env, NOEMIE), `sujets/${SUJET}`), sujet({ nom: ' ' })));
  });
});

describe('Présentations — saisies par l’équipe pédagogique', () => {
  const chemin = `presentations/${SUJET}`;

  it('un administrateur enregistre la présentation d’un sujet', async () => {
    await assertSucceeds(setDoc(doc(connecte(env, NOEMIE), chemin), presentation()));
  });

  it('un lien Drive, pas seulement Slides', async () => {
    await assertSucceeds(
      setDoc(
        doc(connecte(env, NOEMIE), chemin),
        presentation({ url: 'https://drive.google.com/file/d/abc/view' }),
      ),
    );
  });

  it('un administrateur la relit et la retire', async () => {
    const base = connecte(env, NOEMIE);
    await setDoc(doc(base, chemin), presentation());
    await assertSucceeds(getDoc(doc(base, chemin)));
    await assertSucceeds(deleteDoc(doc(base, chemin)));
  });

  it('REFUS — un commercial ne la lit pas directement : la page la sert par le serveur', async () => {
    await env.withSecurityRulesDisabled(async (contexte) => {
      await setDoc(doc(contexte.firestore(), chemin), presentation({ majLe: HIER }));
    });
    await assertFails(getDoc(doc(connecte(env, JORDAN), chemin)));
  });

  it('REFUS — un commercial ne l’écrit pas', async () => {
    await assertFails(
      setDoc(doc(connecte(env, JORDAN), chemin), presentation({ presentePar: 'Jordan' })),
    );
  });

  it('REFUS — un auteur déclaré qui n’est pas celui du jeton', async () => {
    await assertFails(
      setDoc(doc(connecte(env, NOEMIE), chemin), presentation({ presentePar: 'Sophie Martin' })),
    );
  });

  it('REFUS — un administrateur sans nom dans son jeton ne signe pas à vide', async () => {
    const sansNom = { uid: 'uid-anonyme', email: 'anonyme@medere.fr', admin: true };
    await assertFails(
      setDoc(doc(connecte(env, sansNom), chemin), presentation({ presentePar: '' })),
    );
  });

  it('REFUS — un lien qui n’est ni Docs ni Drive', async () => {
    for (const url of [
      'https://example.com/presentation',
      'http://docs.google.com/presentation/d/abc',
      'https://docs.google.com.example.com/x',
      'javascript:alert(1)',
    ]) {
      await assertFails(setDoc(doc(connecte(env, NOEMIE), chemin), presentation({ url })));
    }
  });

  it('REFUS — un lien au-delà de 500 caractères', async () => {
    await assertFails(
      setDoc(
        doc(connecte(env, NOEMIE), chemin),
        presentation({ url: `https://docs.google.com/${texteDe(480)}` }),
      ),
    );
  });

  it('REFUS — une présentation datée de la semaine prochaine', async () => {
    const semaineProchaine = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await assertFails(
      setDoc(
        doc(connecte(env, NOEMIE), chemin),
        presentation({ presenteeLe: Timestamp.fromDate(semaineProchaine) }),
      ),
    );
  });

  it('REFUS — une mise à jour datée par le client', async () => {
    await assertFails(
      setDoc(doc(connecte(env, NOEMIE), chemin), presentation({ majLe: Timestamp.fromDate(HIER) })),
    );
  });

  it('REFUS — un champ hors modèle', async () => {
    await assertFails(
      setDoc(doc(connecte(env, NOEMIE), chemin), presentation({ commentaire: 'à revoir' })),
    );
  });

  it('REFUS — sous un identifiant qui n’est pas celui d’un sujet', async () => {
    await assertFails(
      setDoc(doc(connecte(env, NOEMIE), 'presentations/parodontie'), presentation()),
    );
  });
});
