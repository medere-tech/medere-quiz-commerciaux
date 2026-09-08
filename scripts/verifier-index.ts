/**
 * Vérification des index Firestore.
 *
 * Les index composites ne s'éprouvent pas à l'émulateur : celui-ci exécute
 * n'importe quelle requête sans exiger d'index, et un `firestore.indexes.json`
 * incomplet y passe inaperçu. La panne arrive alors en production, sur la
 * première requête d'un commercial, sous la forme d'un FAILED_PRECONDITION.
 *
 * Ce script est la parade : il déploie les index sur une vraie base, puis
 * exécute chaque requête que l'application émettra et échoue si l'une d'elles
 * réclame un index absent.
 *
 * Usage :
 *   node --env-file=.env.local scripts/verifier-index.ts --projet=<id>
 *   node --env-file=.env.local scripts/verifier-index.ts --projet=<id> --deployer
 *
 * `--deployer` lance `firebase deploy --only firestore:indexes` avant les
 * requêtes. Sans ce drapeau, le script suppose les index déjà déployés.
 *
 * Les requêtes ci-dessous doivent rester le miroir exact de celles du code.
 * Toute requête ajoutée à l'application se déclare ici dans le même geste :
 * ce fichier n'est utile que s'il est complet.
 */

import { execFileSync } from 'node:child_process';

import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore, type Query } from 'firebase-admin/firestore';

type Verification = {
  nom: string;
  /** Lot qui émettra cette requête, pour situer la régression. */
  lot: string;
  requete: (base: Firestore) => Query;
};

/** Sous-collection factice : la requête doit échouer sur l'index, pas sur les données. */
const CHEMIN_REPONSES = 'users/verification-index/reponses';

const VERIFICATIONS: Verification[] = [
  {
    nom: 'questions publiées d’une formation (tirage des séries)',
    lot: 'lot 5',
    requete: (base) =>
      base
        .collection('questions')
        .where('statut', '==', 'publiee')
        .where('formationIds', 'array-contains', 'formation-verification'),
  },
  {
    nom: 'questions par statut, les plus récentes d’abord',
    lot: 'lot 3',
    requete: (base) =>
      base.collection('questions').where('statut', '==', 'publiee').orderBy('modifieeLe', 'desc'),
  },
  {
    nom: 'questions par type, les plus récentes d’abord',
    lot: 'lot 3',
    requete: (base) =>
      base.collection('questions').where('type', '==', 'qcm').orderBy('modifieeLe', 'desc'),
  },
  {
    nom: 'questions par formation, les plus récentes d’abord',
    lot: 'lot 3',
    requete: (base) =>
      base
        .collection('questions')
        .where('formationIds', 'array-contains', 'formation-verification')
        .orderBy('modifieeLe', 'desc'),
  },
  {
    nom: 'questions par statut et type',
    lot: 'lot 3',
    requete: (base) =>
      base
        .collection('questions')
        .where('statut', '==', 'publiee')
        .where('type', '==', 'qcm')
        .orderBy('modifieeLe', 'desc'),
  },
  {
    nom: 'questions par statut et formation',
    lot: 'lot 3',
    requete: (base) =>
      base
        .collection('questions')
        .where('statut', '==', 'publiee')
        .where('formationIds', 'array-contains', 'formation-verification')
        .orderBy('modifieeLe', 'desc'),
  },
  {
    nom: 'questions par statut, type et formation',
    lot: 'lot 3',
    requete: (base) =>
      base
        .collection('questions')
        .where('statut', '==', 'publiee')
        .where('type', '==', 'qcm')
        .where('formationIds', 'array-contains', 'formation-verification')
        .orderBy('modifieeLe', 'desc'),
  },
  {
    nom: 'formations actives, par ordre alphabétique',
    lot: 'lot 2',
    requete: (base) => base.collection('formations').where('actif', '==', true).orderBy('nom'),
  },
  {
    nom: 'dernière tentative sur une question (pondération du tirage)',
    lot: 'lot 5',
    requete: (base) =>
      base
        .collection(CHEMIN_REPONSES)
        .where('questionId', '==', 'question-verification')
        .orderBy('repondueLe', 'desc'),
  },
  {
    nom: 'questions ratées, les plus récentes d’abord',
    lot: 'lot 5',
    requete: (base) =>
      base
        .collection(CHEMIN_REPONSES)
        .where('correcte', '==', false)
        .orderBy('repondueLe', 'desc'),
  },
  {
    nom: 'réponses par origine (entraînement ou session)',
    lot: 'lot 5',
    requete: (base) =>
      base
        .collection(CHEMIN_REPONSES)
        .where('origine', '==', 'entrainement')
        .orderBy('repondueLe', 'desc'),
  },
  {
    nom: 'session en cours',
    lot: 'lot 7',
    requete: (base) =>
      base.collection('sessions').where('statut', '==', 'encours').orderBy('creeeLe', 'desc'),
  },
  {
    /*
     * L'écran de statistiques lit `questionStats` en entier, sans filtre ni
     * tri : le classement porte sur `echecs / tentatives`, une expression que
     * Firestore ne sait pas trier. Aucun index composite n'est donc requis —
     * la vérification existe pour le prouver plutôt que pour le supposer, et
     * pour tomber le jour où quelqu'un ajoutera un filtre à cette lecture.
     */
    nom: 'statistiques agrégées, lecture complète',
    lot: 'lot 6',
    requete: (base) => base.collection('questionStats'),
  },
  {
    /*
     * La banque et l'écran de statistiques lisent les questions par cette
     * seule requête, puis filtrent dans le navigateur. Un champ, un tri :
     * l'index à champ unique est automatique.
     */
    nom: 'questions, les plus récentes d’abord',
    lot: 'lots 3 et 6',
    requete: (base) => base.collection('questions').orderBy('modifieeLe', 'desc'),
  },
];

/** Les index se construisent en arrière-plan : on attend qu'ils soient prêts. */
const ATTENTE_MAXIMALE_MS = 15 * 60 * 1000;
const PAUSE_MS = 15 * 1000;

function argument(nom: string): string | undefined {
  const prefixe = `--${nom}=`;
  return process.argv.find((valeur) => valeur.startsWith(prefixe))?.slice(prefixe.length);
}

function indexManquant(erreur: unknown): boolean {
  const code = (erreur as { code?: unknown }).code;
  const message = String((erreur as { message?: unknown }).message ?? erreur);
  // 9 est le code gRPC FAILED_PRECONDITION.
  return code === 9 || message.includes('FAILED_PRECONDITION') || message.includes('requires an index');
}

/** Firestore glisse dans le message l'adresse de création de l'index manquant. */
function adresseDeCreation(erreur: unknown): string | undefined {
  const message = String((erreur as { message?: unknown }).message ?? '');
  return /https:\/\/console\.firebase\.google\.com\S+/.exec(message)?.[0];
}

function pause(millisecondes: number): Promise<void> {
  return new Promise((resoudre) => setTimeout(resoudre, millisecondes));
}

async function principal(): Promise<void> {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      `FIRESTORE_EMULATOR_HOST est défini (${process.env.FIRESTORE_EMULATOR_HOST}). ` +
        `L'émulateur n'exige aucun index : une vérification qui passerait ici ne ` +
        `prouverait rien. Relancez sans émulateur, contre une vraie base.`,
    );
  }

  const projet = argument('projet') ?? process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const clePrivee = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (!projet || !clientEmail || !clePrivee) {
    throw new Error(
      `Configuration incomplète. Attendu : --projet=<id> (ou ` +
        `FIREBASE_ADMIN_PROJECT_ID), FIREBASE_ADMIN_CLIENT_EMAIL et ` +
        `FIREBASE_ADMIN_PRIVATE_KEY. Lancez le script avec ` +
        `node --env-file=.env.local.`,
    );
  }

  if (process.argv.includes('--deployer')) {
    console.log(`Déploiement des index sur « ${projet} »…`);
    execFileSync(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['firebase', 'deploy', '--only', 'firestore:indexes', '--project', projet],
      { stdio: 'inherit' },
    );
  }

  const base = getFirestore(
    initializeApp({
      credential: cert({ projectId: projet, clientEmail, privateKey: clePrivee.replace(/\\n/g, '\n') }),
      projectId: projet,
    }),
  );

  console.log(`Vérification de ${VERIFICATIONS.length} requêtes sur « ${projet} ».`);

  const echeance = Date.now() + ATTENTE_MAXIMALE_MS;
  let restantes = [...VERIFICATIONS];
  const manquants = new Map<string, string | undefined>();

  while (restantes.length > 0) {
    const aReprendre: Verification[] = [];
    manquants.clear();

    for (const verification of restantes) {
      try {
        await verification.requete(base).limit(1).get();
        console.log(`  OK      ${verification.nom}`);
      } catch (erreur) {
        if (!indexManquant(erreur)) throw erreur;
        aReprendre.push(verification);
        manquants.set(`${verification.nom} (${verification.lot})`, adresseDeCreation(erreur));
      }
    }

    restantes = aReprendre;
    if (restantes.length === 0) break;

    if (Date.now() >= echeance) {
      console.error(`\n${restantes.length} requête(s) sans index après attente :`);
      for (const [nom, adresse] of manquants) {
        console.error(`  MANQUANT  ${nom}`);
        if (adresse) console.error(`            créer : ${adresse}`);
      }
      console.error(
        `\nAjoutez ces index à firestore.indexes.json, déployez-les, puis relancez. ` +
          `Ne déployez pas l'application tant que cette vérification échoue.`,
      );
      process.exitCode = 1;
      return;
    }

    console.log(
      `  ${restantes.length} index encore en construction, nouvelle tentative dans ` +
        `${PAUSE_MS / 1000} secondes…`,
    );
    await pause(PAUSE_MS);
  }

  console.log(`\nToutes les requêtes sont couvertes par un index.`);
}

principal().catch((erreur: unknown) => {
  console.error(`\nÉchec de la vérification : ${(erreur as Error).message}`);
  process.exitCode = 1;
});
