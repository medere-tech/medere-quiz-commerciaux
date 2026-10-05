import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { CHAMPS, CHAMPS_SUJET, type EnregistrementAirtable } from '@/lib/airtable/contrat';

/**
 * Les sujets de bout en bout : Airtable, la synchronisation, la base, le
 * chargeur de la page.
 *
 * **Une seule frontière est simulée : Airtable.** Ses réponses ont la forme
 * que l'API REST rend réellement — le lien en tableau à plat d'identifiants,
 * vérifié le 5 octobre 2026 par une lecture sur la vraie base. Tout le reste
 * est le vrai code : la synchronisation écrit sur l'émulateur, et le chargeur
 * de la page relit ce qu'elle a écrit. Les documents ne sont donc pas des
 * fixtures recopiées : c'est le serveur qui les construit.
 */

const etat = vi.hoisted(() => ({
  base: undefined as Firestore | undefined,
  formations: [] as EnregistrementAirtable[],
  sujets: [] as EnregistrementAirtable[],
}));

vi.mock(import('@/lib/env/serveur'), () => ({
  envServeur: {
    projetId: 'demo-medere-quiz',
    clientEmail: '',
    clePrivee: '',
    domaineAutorise: 'medere.fr' as const,
    adressesAdministrateurs: ['noemie@medere.fr'],
    airtable: { jeton: '', baseId: '', tableFormations: '' },
    secretCron: '',
  },
}));

vi.mock(import('@/lib/firebase/admin'), () => ({
  firestoreAdmin: () => {
    if (!etat.base) throw new Error('Base de test non initialisée.');
    return etat.base;
  },
}));

vi.mock(import('@/lib/airtable/client'), async (original) => ({
  ...(await original()),
  lireFormations: async () => etat.formations,
  lireSujets: async () => etat.sujets,
}));

vi.mock(import('@/lib/auth/session-serveur'), async (original) => {
  const vrai = await original();
  const session = () => ({
    uid: 'uid-jordan',
    email: 'jordan@medere.fr',
    nom: 'Jordan',
    admin: false,
    renouvellementConseille: false,
  });
  return { ...vrai, lireSession: async () => session(), exigerSession: async () => session() };
});

const { synchroniserFormations, ErreurSynchronisation } = await import(
  '@/lib/airtable/synchronisation'
);
const { chargerSujet } = await import('@/lib/serveur/sujets');

const SOMMEIL = 'recSujetSommeil01';
const ORL = 'recSujetOrl000001';
const VIDE = 'recSujetSansFich1';

function fiche(id: string, sujet: string | null, champs: Record<string, unknown> = {}) {
  return {
    id,
    fields: {
      [CHAMPS.numeroActionDpc]: `9262${id.slice(-5)}`,
      [CHAMPS.nom]: `Fiche ${id}`,
      [CHAMPS.cibles]: ['Médecin généraliste'],
      [CHAMPS.format]: 'Présentiel',
      [CHAMPS.statutSource]: 'Active',
      ...(sujet ? { [CHAMPS.sujet]: [sujet] } : {}),
      ...champs,
    },
  };
}

const sujet = (id: string, nom: string) => ({ id, fields: { [CHAMPS_SUJET.nom]: nom } });

let app: App;

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('Ces tests exigent l’émulateur Firestore. Lancez-les par `npm test`.');
  }
  app = initializeApp({ projectId: 'demo-medere-quiz' }, 'sujets');
  etat.base = getFirestore(app);
});

afterAll(async () => {
  if (app) await deleteApp(app);
});

beforeEach(async () => {
  const base = etat.base!;
  for (const nom of ['formations', 'sujets', 'presentations', 'questions', 'synchronisations', 'users']) {
    await base.recursiveDelete(base.collection(nom));
  }
  etat.formations = [
    fiche('recFicheSommeil01', SOMMEIL),
    fiche('recFicheSommeil02', SOMMEIL, { [CHAMPS.format]: 'E-Learning' }),
    fiche('recFicheSommeil03', SOMMEIL, { [CHAMPS.statutSource]: 'Suspendue' }),
    fiche('recFicheOrl000001', ORL),
    fiche('recFicheSansSujet', null),
  ];
  etat.sujets = [sujet(SOMMEIL, 'Troubles du sommeil'), sujet(ORL, 'Symptômes ORL'), sujet(VIDE, 'Sans fiche')];
});

describe('La synchronisation des sujets', () => {
  it('rattache chaque fiche à son sujet, et écrit le miroir des sujets', async () => {
    const rapport = await synchroniserFormations({ forcer: true });
    const base = etat.base!;

    expect(rapport.sujetsLus).toBe(3);
    expect(rapport.sujetsIntrouvables).toEqual([]);
    expect((await base.doc('formations/recFicheSommeil01').get()).get('sujetId')).toBe(SOMMEIL);
    expect((await base.doc('formations/recFicheSansSujet').get()).get('sujetId')).toBeNull();
    expect((await base.doc(`sujets/${SOMMEIL}`).get()).data()).toMatchObject({
      airtableId: SOMMEIL,
      nom: 'Troubles du sommeil',
      actif: true,
    });
  });

  it('ne touche jamais à la présentation : la synchronisation de la nuit ne l’efface pas', async () => {
    const base = etat.base!;
    await synchroniserFormations({ forcer: true });
    await base.doc(`presentations/${SOMMEIL}`).set({
      url: 'https://docs.google.com/presentation/d/abc',
      presenteeLe: Timestamp.fromDate(new Date('2026-09-24T10:00:00Z')),
      presentePar: 'Noémie Vasseur',
      majLe: Timestamp.now(),
    });

    await synchroniserFormations({ forcer: true });

    expect((await base.doc(`presentations/${SOMMEIL}`).get()).get('url')).toBe(
      'https://docs.google.com/presentation/d/abc',
    );
  });

  it('désactive un sujet disparu d’Airtable, sans le supprimer', async () => {
    await synchroniserFormations({ forcer: true });
    etat.sujets = etat.sujets.filter((s) => s.id !== VIDE);

    const rapport = await synchroniserFormations({ forcer: true });

    expect(rapport.sujetsDesactives).toBe(1);
    expect((await etat.base!.doc(`sujets/${VIDE}`).get()).get('actif')).toBe(false);
  });

  it('une fiche dont le sujet n’a pas été lu est écrite sans sujet, et nommée', async () => {
    etat.sujets = etat.sujets.filter((s) => s.id !== ORL);

    const rapport = await synchroniserFormations({ forcer: true });

    expect(rapport.sujetsIntrouvables).toEqual(['recFicheOrl000001']);
    expect((await etat.base!.doc('formations/recFicheOrl000001').get()).get('sujetId')).toBeNull();
  });

  it('REFUS — une table Sujets lue vide n’ôte pas leur sujet à toutes les fiches', async () => {
    await synchroniserFormations({ forcer: true });
    etat.sujets = [];

    await expect(synchroniserFormations({ forcer: true })).rejects.toBeInstanceOf(
      ErreurSynchronisation,
    );
    expect((await etat.base!.doc('formations/recFicheSommeil01').get()).get('sujetId')).toBe(SOMMEIL);
  });
});

describe('Le chargeur de la page d’un sujet', () => {
  beforeEach(async () => {
    await synchroniserFormations({ forcer: true });
    const base = etat.base!;
    const question = (id: string, formationIds: string[], statut: string) =>
      base.doc(`questions/${id}`).set({ formationIds, statut });
    await Promise.all([
      question('q-sommeil', ['recFicheSommeil01'], 'publiee'),
      question('q-deux-fiches', ['recFicheSommeil01', 'recFicheSommeil02'], 'aRelire'),
      question('q-suspendue', ['recFicheSommeil03'], 'publiee'),
      question('q-brouillon', ['recFicheSommeil02'], 'brouillon'),
      question('q-orl', ['recFicheOrl000001'], 'publiee'),
    ]);
  });

  it('rend le sujet, toutes ses fiches et ses seules questions servies, sans doublon', async () => {
    const charge = await chargerSujet(SOMMEIL);

    expect(charge?.nom).toBe('Troubles du sommeil');
    expect(charge?.fiches.map((f) => f.id).sort()).toEqual([
      'recFicheSommeil01',
      'recFicheSommeil02',
      'recFicheSommeil03',
    ]);
    expect(charge?.questions.map((q) => q.id).sort()).toEqual([
      'q-deux-fiches',
      'q-sommeil',
      'q-suspendue',
    ]);
    expect(charge?.presentation).toBeNull();
  });

  it('rend la présentation saisie par l’équipe', async () => {
    const presenteeLe = new Date('2026-09-24T10:00:00Z');
    await etat.base!.doc(`presentations/${SOMMEIL}`).set({
      url: 'https://docs.google.com/presentation/d/abc',
      presenteeLe: Timestamp.fromDate(presenteeLe),
      presentePar: 'Noémie Vasseur',
      majLe: Timestamp.now(),
    });

    expect((await chargerSujet(SOMMEIL))?.presentation).toEqual({
      url: 'https://docs.google.com/presentation/d/abc',
      presenteeLeMs: presenteeLe.getTime(),
      presentePar: 'Noémie Vasseur',
    });
  });

  it('un sujet sans fiche, inconnu, ou mal nommé : introuvable', async () => {
    expect(await chargerSujet(VIDE)).toBeNull();
    expect(await chargerSujet('recSujetInconnu01')).toBeNull();
    expect(await chargerSujet('../users/uid-jordan')).toBeNull();
  });
});
