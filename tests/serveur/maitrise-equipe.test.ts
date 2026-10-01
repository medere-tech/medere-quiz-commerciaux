import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ID_FORMATION_TRANSVERSE } from '@/lib/formations/transverse';
import { clefDuJour } from '@/lib/serie/assiduite';

/**
 * Le suivi individuel de l'équipe pédagogique.
 *
 * **Ce module contourne les règles Firestore**, et c'est la décision du
 * 30 septembre 2026, écrite au README. Les règles continuent de fermer
 * `users/{uid}` à tout client autre que son propriétaire : aucun test
 * d'isolation n'a changé, et c'est la base qui garantit qu'aucun commercial ne
 * lit un autre commercial. Ce fichier garde le reste — ce que voit l'équipe
 * pédagogique, et rien au-delà.
 *
 * Deux familles de tests :
 *
 * - **Le texte du module**, comme pour `donnees-privees` : un test de
 *   comportement ne voit que les chemins qu'on lui montre. Qu'une fonction
 *   exportée commence par vérifier le rôle, qu'aucune ne lise `reponses`,
 *   qu'aucun écran commercial ne l'importe — cela se lit dans le code.
 * - **Le comportement, sur l'émulateur.** Les données sont posées dans une
 *   vraie base, les vraies requêtes du module tournent dessus. Seules la
 *   session et la liste `ADMIN_EMAILS` sont simulées : ce sont les entrées du
 *   module, pas le monde qu'il interroge.
 */

const SOURCE = readFileSync('src/lib/serveur/maitrise-equipe.ts', 'utf8');
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('Garanties lues dans le code', () => {
  it('importe server-only', () => {
    expect(CODE).toMatch(/^import 'server-only';/m);
  });

  it('vérifie le rôle avant toute lecture, dans chaque fonction exportée', () => {
    const corps = [...CODE.matchAll(/export\s+async\s+function\s+(\w+)\s*\([^)]*\)[^{]*\{\s*([^\n]*)/g)];

    expect(corps.map(([, nom]) => nom)).toEqual([
      'chargerMaitriseEquipe',
      'chargerSuiviCommercial',
      'chargerResultatsQuestion',
    ]);
    for (const [, nom, premiereLigne] of corps) {
      expect(`${nom} : ${premiereLigne?.trim()}`).toBe(`${nom} : await exigerAdmin();`);
    }
  });

  it('n’exporte aucune fonction qui ne soit pas asynchrone, donc gardée', () => {
    expect(CODE).not.toMatch(/export\s+function\s/);
    expect(CODE).not.toMatch(/export\s+(const|let|var|class)\s/);
  });

  it('ne lit l’historique des réponses que pour le compter', () => {
    // La maîtrise vient des états. `reponses` n'apparaît que dans la fonction
    // qui compte les options cochées d'une question — et nulle part ailleurs.
    // `\r?\n` : le dépôt est extrait en CRLF sous Windows (core.autocrlf).
    const horsRepartition = CODE.replace(/async function repartitionDesReponses[\s\S]*?\r?\n\}\r?\n/, '');
    expect(CODE).toMatch(/async function repartitionDesReponses/);
    expect(horsRepartition).not.toMatch(/'reponses'/);
    const collections = [...CODE.matchAll(/\.collection(?:Group)?\(\s*'([^']+)'/g)].map((m) => m[1]);
    // Les comptes et leurs états ; la question elle-même et son agrégat
    // anonyme, pour l'écran d'une question. Rien d'autre.
    for (const nom of collections) expect(['users', 'etats', 'questions', 'questionStats', 'reponses']).toContain(nom);
  });

  it('n’est importé que par les routes du back-office', () => {
    const fichiers: string[] = [];
    const parcourir = (dossier: string) => {
      for (const nom of readdirSync(dossier)) {
        const chemin = join(dossier, nom);
        if (statSync(chemin).isDirectory()) parcourir(chemin);
        else if (/\.(ts|tsx)$/.test(nom)) fichiers.push(chemin.replace(/\\/g, '/'));
      }
    };
    parcourir('src');

    const importateurs = fichiers.filter(
      (fichier) =>
        !fichier.endsWith('maitrise-equipe.ts') &&
        /serveur\/maitrise-equipe['"]/.test(readFileSync(fichier, 'utf8')),
    );
    for (const fichier of importateurs) expect(fichier).toMatch(/^src\/app\/admin\//);
  });
});

/* ---------------------------------------------------------- comportement */

const etat = vi.hoisted(() => ({
  admin: true,
  base: undefined as Firestore | undefined,
  lectures: 0,
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
    etat.lectures += 1;
    if (!etat.base) throw new Error('Base de test non initialisée.');
    return etat.base;
  },
}));

vi.mock(import('@/lib/auth/session-serveur'), async (original) => {
  const vrai = await original();
  const session = () => ({
    uid: 'uid-noemie',
    email: 'noemie@medere.fr',
    nom: 'Noémie',
    admin: etat.admin,
    renouvellementConseille: false,
  });
  return {
    ...vrai,
    lireSession: async () => session(),
    exigerSession: async () => session(),
    // La même règle que la vraie : le rôle, ou `ErreurAcces` 403.
    exigerAdmin: async () => {
      if (!etat.admin) throw new vrai.ErreurAcces('Cet espace est réservé à l’équipe pédagogique.', 403);
      return session();
    },
  };
});

const { chargerMaitriseEquipe, chargerResultatsQuestion, chargerSuiviCommercial } = await import(
  '@/lib/serveur/maitrise-equipe'
);

let app: App;

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      'Ces tests exigent l’émulateur Firestore. Lancez-les par `npm test`, ' +
        'qui passe par `firebase emulators:exec`.',
    );
  }
  app = initializeApp({ projectId: 'demo-medere-quiz' }, 'maitrise-equipe');
  etat.base = getFirestore(app);
});

afterAll(async () => {
  if (app) await deleteApp(app);
});

const HIER = Timestamp.fromDate(new Date('2026-09-29T10:00:00Z'));

async function vider(base: Firestore): Promise<void> {
  for (const collection of ['users', 'questions', 'formations', 'questionStats']) {
    await base.recursiveDelete(base.collection(collection));
  }
}

/**
 * Deux formations, trois questions servies et un brouillon ; deux commerciaux
 * et une administratrice qui s'entraîne aussi.
 *
 * - Léa a vu q1 (juste) et q2 (ratée) : paro 50 %, DPC 0 %.
 * - Marc n'a jamais joué.
 * - Noémie a tout juste : elle ne doit apparaître nulle part.
 */
async function semer(base: Firestore): Promise<void> {
  await base.doc('formations/recPARO').set({ nom: 'Parodontie', actif: true, cibles: ['Chirurgien dentiste'] });
  await base.doc(`formations/${ID_FORMATION_TRANSVERSE}`).set({ nom: 'DPC et réglementation', actif: true, cibles: [], transverse: true });

  const question = (enonce: string, formationIds: string[], statut = 'publiee') => ({
    type: 'vf', enonce, formationIds, theme: 'Contenu', difficulte: 1, statut, creeePar: 'uid-noemie', creeeLe: HIER,
    explication: `Explication de « ${enonce} ».`, modifieeLe: HIER,
    options: { o1: 'Vrai', o2: 'Faux' }, ordreOptions: ['o1', 'o2'], bonnesReponses: ['o1'],
  });
  await base.doc('questions/q1').set(question('Parodontie : vrai ?', ['recPARO']));
  await base.doc('questions/q2').set(question('Parodontie : faux ?', ['recPARO']));
  // Mixte, transverse citée en premier : sa formation principale est la parodontie.
  await base.doc('questions/q3').set(question('Obligation triennale ?', [ID_FORMATION_TRANSVERSE, 'recPARO']));
  await base.doc('questions/brouillon').set(question('Pas servie', ['recPARO'], 'brouillon'));
  await base.doc('questionStats/q2').set({ tentatives: 4, echecs: 3, majLe: HIER });
  // Léa a répondu deux fois à q2, Marc une fois ; Noémie aussi, mais elle
  // appartient à l'équipe pédagogique : sa réponse ne compte pas.
  const reponse = (optionsChoisies: string[]) => ({ questionId: 'q2', optionsChoisies, correcte: optionsChoisies[0] === 'o1', origine: 'entrainement', repondueLe: HIER });
  await base.doc('users/uid-lea/reponses/r1').set(reponse(['o2']));
  await base.doc('users/uid-lea/reponses/r2').set(reponse(['o1']));
  await base.doc('users/uid-marc/reponses/r1').set(reponse(['o2']));
  await base.doc('users/uid-noemie/reponses/r1').set(reponse(['o1']));

  const compte = (uid: string, email: string, nom: string) =>
    base.doc(`users/${uid}`).set({ email, nom, etoiles: 0, seriesTerminees: 0 });
  await compte('uid-lea', 'lea@medere.fr', 'Léa');
  await compte('uid-marc', 'marc@medere.fr', 'Marc');
  await compte('uid-noemie', 'noemie@medere.fr', 'Noémie');

  const etatQuestion = (tentatives: number, reussies: number, derniereRatee: boolean) => ({
    tentatives, reussies, derniereRatee, majLe: HIER,
  });
  await base.doc('users/uid-lea/etats/q1').set(etatQuestion(1, 1, false));
  await base.doc('users/uid-lea/etats/q2').set(etatQuestion(2, 1, true));
  for (const id of ['q1', 'q2', 'q3']) await base.doc(`users/uid-noemie/etats/${id}`).set(etatQuestion(1, 1, false));
}

beforeEach(async () => {
  etat.admin = true;
  etat.lectures = 0;
  await vider(etat.base!);
  await semer(etat.base!);
  etat.lectures = 0;
});

afterEach(async () => {
  await vider(etat.base!);
});

describe('Sans le rôle', () => {
  it('chaque fonction lève, et rien n’est lu', async () => {
    etat.admin = false;

    await expect(chargerMaitriseEquipe()).rejects.toThrow('équipe pédagogique');
    await expect(chargerSuiviCommercial('uid-lea')).rejects.toThrow('équipe pédagogique');
    await expect(chargerResultatsQuestion('q1')).rejects.toThrow('équipe pédagogique');
    expect(etat.lectures).toBe(0);
  });
});

describe('La liste de l’équipe', () => {
  it('écarte l’équipe pédagogique et garde qui n’a jamais joué', async () => {
    const { commerciaux } = await chargerMaitriseEquipe();

    expect(commerciaux.map((c) => c.nom)).toEqual(['Léa', 'Marc']);
  });

  it('donne la maîtrise que le commercial voit lui-même', async () => {
    const lea = (await chargerMaitriseEquipe()).commerciaux.find((c) => c.uid === 'uid-lea')!;

    // Trois questions servies, une maîtrisée : le brouillon ne compte pas.
    expect(lea.maitrise).toEqual({ maitrisees: 1, total: 3, pourcentage: 33 });
    expect(lea.vues).toBe(2);
    expect(lea.aRevoir).toBe(1);
    expect(lea.derniereActiviteMs).toBe(HIER.toMillis());
  });

  it('compte à zéro qui n’a pas joué dans la maîtrise d’équipe', async () => {
    const { parFormation } = await chargerMaitriseEquipe();
    const paro = parFormation.find((ligne) => ligne.formationId === 'recPARO')!;

    // Léa 33 % (une sur trois), Marc 0 % : 17 %, et non 33 %.
    expect(paro.commerciaux).toBe(2);
    expect(paro.pourcentage).toBe(17);
  });
});

describe('Un commercial, question par question', () => {
  it('rend chaque question servie, rangée sous sa formation principale', async () => {
    const suivi = (await chargerSuiviCommercial('uid-lea'))!;

    expect(suivi.questions.map((q) => q.questionId).sort()).toEqual(['q1', 'q2', 'q3']);
    expect(suivi.questions.find((q) => q.questionId === 'q3')?.formationNom).toBe('Parodontie');
    expect(suivi.questions.find((q) => q.questionId === 'q2')?.etat).toMatchObject({
      tentatives: 2,
      reussies: 1,
      derniereRatee: true,
    });
  });

  it('place sa maîtrise à côté de celle de l’équipe, qui n’a pas joué compris', async () => {
    const suivi = (await chargerSuiviCommercial('uid-lea'))!;

    // Léa 33 %, Marc 0 % : 17 %. Noémie, qui a tout juste, n'y compte pas.
    expect(suivi.maitrise.pourcentage).toBe(33);
    expect(suivi.maitriseEquipe).toBe(17);
  });

  it('compte les questions ratées plusieurs fois parmi celles à revoir', async () => {
    // q3 : trois tentatives, une seule juste, la dernière ratée — deux échecs.
    await etat.base!.doc('users/uid-lea/etats/q3').set({ tentatives: 3, reussies: 1, derniereRatee: true, majLe: HIER });

    const suivi = (await chargerSuiviCommercial('uid-lea'))!;

    // q2 n'a qu'un échec : à revoir, pas « plusieurs fois ».
    expect(suivi.aRevoir).toBe(2);
    expect(suivi.rateesPlusieursFois).toBe(1);
  });

  it('lit ses séries, sa semaine et sa couleur sur son document', async () => {
    const aujourdhui = clefDuJour(new Date());
    await etat.base!.doc('users/uid-lea').update({
      seriesTerminees: 7,
      avatar: 'vert',
      // Un jour de cette semaine, un jour d'une semaine passée : seul le premier compte.
      assiduite: { dernierJour: aujourdhui, serie: 1, record: 4, semaine: ['2020-01-06', aujourdhui] },
    });

    const lea = (await chargerSuiviCommercial('uid-lea'))!;
    expect(lea.seriesTerminees).toBe(7);
    expect(lea.joursActifsCetteSemaine).toBe(1);
    expect(lea.avatar).toBe('vert');

    // Marc n'a rien de tout cela : les valeurs d'un compte neuf.
    const marc = (await chargerSuiviCommercial('uid-marc'))!;
    expect(marc).toMatchObject({ seriesTerminees: 0, joursActifsCetteSemaine: 0, avatar: 'encre' });
  });

  it('range les formations de la plus faible à la plus forte, avec leur forme', async () => {
    const suivi = (await chargerSuiviCommercial('uid-lea'))!;

    // DPC 0 % (q3 jamais vue), parodontie 33 % (q1 juste sur trois).
    expect(suivi.parFormation.map((ligne) => [ligne.formationId, ligne.maitrise.pourcentage])).toEqual([
      [ID_FORMATION_TRANSVERSE, 0],
      ['recPARO', 33],
    ]);
    expect(suivi.parFormation[1]!.fichier).toBe('forme-2-FECA45.svg');
    expect(suivi.questions.find((q) => q.questionId === 'q1')?.formationFichier).toBe('forme-2-FECA45.svg');
  });

  it('ne suit pas un membre de l’équipe pédagogique, ni un inconnu', async () => {
    expect(await chargerSuiviCommercial('uid-noemie')).toBeNull();
    expect(await chargerSuiviCommercial('uid-inconnu')).toBeNull();
  });
});

describe('Une question, commercial par commercial', () => {
  it('liste chaque commercial et son état sur la question', async () => {
    const resultats = (await chargerResultatsQuestion('q2'))!;

    expect(resultats.commerciaux.map((c) => [c.nom, c.etat.derniereRatee, c.etat.dejaVue])).toEqual([
      ['Léa', true, true],
      ['Marc', false, false],
    ]);
  });

  it('porte l’explication, la formation et les compteurs anonymes de questionStats', async () => {
    const resultats = (await chargerResultatsQuestion('q2'))!;

    expect(resultats.explication).toBe('Explication de « Parodontie : faux ? ».');
    expect(resultats.formation?.nom).toBe('Parodontie');
    expect(resultats.stats).toEqual({ tentatives: 4, echecs: 3 });
    expect(resultats.modifieeLeMs).toBe(HIER.toMillis());
    expect((await chargerResultatsQuestion('q1'))!.stats).toBeNull();
  });

  it('compte les options cochées par les commerciaux, sans dire qui', async () => {
    const resultats = (await chargerResultatsQuestion('q2'))!;

    expect(resultats.reponsesComptees).toBe(3);
    expect(resultats.repartition).toEqual([
      { optionId: 'o1', libelle: 'Vrai', juste: true, nombre: 1 },
      { optionId: 'o2', libelle: 'Faux', juste: false, nombre: 2 },
    ]);
    const texte = JSON.stringify(resultats);
    expect(texte).not.toMatch(/optionsChoisies|repondueLe/);
  });

  it('ne rend rien pour une question qui n’est pas servie', async () => {
    expect(await chargerResultatsQuestion('brouillon')).toBeNull();
  });
});
