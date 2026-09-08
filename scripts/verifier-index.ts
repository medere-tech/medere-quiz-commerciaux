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
 *
 * **Deux causes, un seul code d'erreur.** Un index absent et un index en cours
 * de construction renvoient tous deux FAILED_PRECONDITION. Les confondre fait
 * attendre un quart d'heure devant un index qui n'existe pas, en annonçant une
 * construction imaginaire — et un script de pré-déploiement qui tourne sans
 * fin, personne ne l'attend jusqu'au bout. Le script interroge donc l'API
 * d'administration Firestore pour connaître l'état réel des index, et ne
 * patiente que s'il en voit vraiment se construire. S'il ne peut pas lire cet
 * état, il le dit et borne son attente au lieu de deviner.
 */

import { execFileSync } from 'node:child_process';

import { cert, initializeApp, type App } from 'firebase-admin/app';
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
  /* --- Banque de questions : filtres et tri, tous côté serveur (lot 3) ---
   *
   * Sept combinaisons de filtres, trois tris. Sans filtre, l'index à champ
   * unique suffit ; avec, il faut un index composite par couple. Le tri par
   * date décroissante et croissante partage le même index, qui se parcourt
   * dans les deux sens.
   */
  {
    nom: 'banque sans filtre, par date',
    lot: 'lots 3 et 6',
    requete: (base) => base.collection('questions').orderBy('modifieeLe', 'desc'),
  },
  {
    nom: 'banque sans filtre, par date croissante',
    lot: 'lot 3',
    requete: (base) => base.collection('questions').orderBy('modifieeLe', 'asc'),
  },
  {
    nom: 'banque sans filtre, par énoncé',
    lot: 'lot 3',
    requete: (base) => base.collection('questions').orderBy('enonce'),
  },
  {
    nom: 'banque filtrée par statut, par date',
    lot: 'lot 3',
    requete: (base) =>
      base
        .collection('questions')
        .where('statut', '==', 'publiee')
        .orderBy('modifieeLe', 'desc'),
  },
  {
    nom: 'banque filtrée par statut, par énoncé',
    lot: 'lot 3',
    requete: (base) =>
      base
        .collection('questions')
        .where('statut', '==', 'publiee')
        .orderBy('enonce'),
  },
  {
    nom: 'banque filtrée par format, par date',
    lot: 'lot 3',
    requete: (base) =>
      base
        .collection('questions')
        .where('type', '==', 'qcm')
        .orderBy('modifieeLe', 'desc'),
  },
  {
    nom: 'banque filtrée par format, par énoncé',
    lot: 'lot 3',
    requete: (base) =>
      base
        .collection('questions')
        .where('type', '==', 'qcm')
        .orderBy('enonce'),
  },
  {
    nom: 'banque filtrée par formation, par date',
    lot: 'lot 3',
    requete: (base) =>
      base
        .collection('questions')
        .where('formationIds', 'array-contains', 'formation-verification')
        .orderBy('modifieeLe', 'desc'),
  },
  {
    nom: 'banque filtrée par formation, par énoncé',
    lot: 'lot 3',
    requete: (base) =>
      base
        .collection('questions')
        .where('formationIds', 'array-contains', 'formation-verification')
        .orderBy('enonce'),
  },
  {
    nom: 'banque filtrée par statut et format, par date',
    lot: 'lot 3',
    requete: (base) =>
      base
        .collection('questions')
        .where('statut', '==', 'publiee')
        .where('type', '==', 'qcm')
        .orderBy('modifieeLe', 'desc'),
  },
  {
    nom: 'banque filtrée par statut et format, par énoncé',
    lot: 'lot 3',
    requete: (base) =>
      base
        .collection('questions')
        .where('statut', '==', 'publiee')
        .where('type', '==', 'qcm')
        .orderBy('enonce'),
  },
  {
    nom: 'banque filtrée par statut et formation, par date',
    lot: 'lot 3',
    requete: (base) =>
      base
        .collection('questions')
        .where('statut', '==', 'publiee')
        .where('formationIds', 'array-contains', 'formation-verification')
        .orderBy('modifieeLe', 'desc'),
  },
  {
    nom: 'banque filtrée par statut et formation, par énoncé',
    lot: 'lot 3',
    requete: (base) =>
      base
        .collection('questions')
        .where('statut', '==', 'publiee')
        .where('formationIds', 'array-contains', 'formation-verification')
        .orderBy('enonce'),
  },
  {
    nom: 'banque filtrée par format et formation, par date',
    lot: 'lot 3',
    requete: (base) =>
      base
        .collection('questions')
        .where('type', '==', 'qcm')
        .where('formationIds', 'array-contains', 'formation-verification')
        .orderBy('modifieeLe', 'desc'),
  },
  {
    nom: 'banque filtrée par format et formation, par énoncé',
    lot: 'lot 3',
    requete: (base) =>
      base
        .collection('questions')
        .where('type', '==', 'qcm')
        .where('formationIds', 'array-contains', 'formation-verification')
        .orderBy('enonce'),
  },
  {
    nom: 'banque filtrée par statut, format et formation, par date',
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
    nom: 'banque filtrée par statut, format et formation, par énoncé',
    lot: 'lot 3',
    requete: (base) =>
      base
        .collection('questions')
        .where('statut', '==', 'publiee')
        .where('type', '==', 'qcm')
        .where('formationIds', 'array-contains', 'formation-verification')
        .orderBy('enonce'),
  },
  /* --- Tri par date croissante, sur les mêmes filtres ---
   *
   * Un index composite ne se parcourt PAS dans les deux sens. Firestore
   * inverse l'ordre complet, pas un champ isolé : `(statut ASC, modifieeLe
   * DESC)` ne sert pas un tri `(statut ASC, modifieeLe ASC)`. La direction
   * n'est libre que sur un champ filtré par égalité, jamais sur le champ de
   * tri — « to run the same queries but with a descending sort order, you
   * need an additional index in the descending direction ». Chaque tri a donc
   * son index, et ces sept vérifications le prouvent.
   */
  {
    nom: 'banque filtrée par statut, par date croissante',
    lot: 'lot 3',
    requete: (base) =>
      base
        .collection('questions')
        .where('statut', '==', 'publiee')
        .orderBy('modifieeLe', 'asc'),
  },
  {
    nom: 'banque filtrée par format, par date croissante',
    lot: 'lot 3',
    requete: (base) =>
      base
        .collection('questions')
        .where('type', '==', 'qcm')
        .orderBy('modifieeLe', 'asc'),
  },
  {
    nom: 'banque filtrée par formation, par date croissante',
    lot: 'lot 3',
    requete: (base) =>
      base
        .collection('questions')
        .where('formationIds', 'array-contains', 'formation-verification')
        .orderBy('modifieeLe', 'asc'),
  },
  {
    nom: 'banque filtrée par statut et format, par date croissante',
    lot: 'lot 3',
    requete: (base) =>
      base
        .collection('questions')
        .where('statut', '==', 'publiee')
        .where('type', '==', 'qcm')
        .orderBy('modifieeLe', 'asc'),
  },
  {
    nom: 'banque filtrée par statut et formation, par date croissante',
    lot: 'lot 3',
    requete: (base) =>
      base
        .collection('questions')
        .where('statut', '==', 'publiee')
        .where('formationIds', 'array-contains', 'formation-verification')
        .orderBy('modifieeLe', 'asc'),
  },
  {
    nom: 'banque filtrée par format et formation, par date croissante',
    lot: 'lot 3',
    requete: (base) =>
      base
        .collection('questions')
        .where('type', '==', 'qcm')
        .where('formationIds', 'array-contains', 'formation-verification')
        .orderBy('modifieeLe', 'asc'),
  },
  {
    nom: 'banque filtrée par statut, format et formation, par date croissante',
    lot: 'lot 3',
    requete: (base) =>
      base
        .collection('questions')
        .where('statut', '==', 'publiee')
        .where('type', '==', 'qcm')
        .where('formationIds', 'array-contains', 'formation-verification')
        .orderBy('modifieeLe', 'asc'),
  },

  /* --- Parcours commercial (lot 5) --- */
  {
    nom: 'questions publiées, pour le tirage des séries',
    lot: 'lot 5',
    requete: (base) => base.collection('questions').where('statut', '==', 'publiee'),
  },

  /* --- Référentiel des formations (lots 2 et 3) --- */
  {
    nom: 'formations au catalogue, par ordre alphabétique',
    lot: 'lots 2 et 3',
    requete: (base) => base.collection('formations').where('actif', '==', true).orderBy('nom'),
  },
  {
    nom: 'formations hors catalogue, par ordre alphabétique',
    lot: 'lot 3',
    requete: (base) => base.collection('formations').where('actif', '==', false).orderBy('nom'),
  },
  {
    nom: 'référentiel complet, par ordre alphabétique',
    lot: 'lots 2 et 3',
    requete: (base) => base.collection('formations').orderBy('nom'),
  },

  /* --- Statistiques agrégées (lot 6) ---
   *
   * Lecture complète, sans filtre ni tri : le classement porte sur
   * `echecs / tentatives`, une expression que Firestore ne sait pas trier.
   */
  {
    nom: 'statistiques agrégées, lecture complète',
    lot: 'lot 6',
    requete: (base) => base.collection('questionStats'),
  },

  /* --- Réponses d'un commercial (lot 5) ---
   *
   * Lues en entier, sans filtre : savoir si la *dernière* tentative sur une
   * question est un échec suppose de connaître tout l'historique de cette
   * question. Aucun filtre serveur ne répond à cette question-là.
   */
  {
    nom: 'réponses d’un commercial, lecture complète',
    lot: 'lot 5',
    requete: (base) => base.collection(CHEMIN_REPONSES),
  },
];

/** Les index se construisent en arrière-plan : on attend qu'ils soient prêts. */
const ATTENTE_MAXIMALE_MS = 15 * 60 * 1000;
const PAUSE_MS = 15 * 1000;

/**
 * Combien de tours on accepte de faire sans savoir si des index se
 * construisent. Sert de garde-fou quand l'API d'administration est
 * injoignable : mieux vaut un verdict incertain à deux minutes qu'une attente
 * muette d'un quart d'heure.
 */
const TOURS_A_L_AVEUGLE = 8;

type EtatIndex = { enConstruction: number; prets: number };

/**
 * État réel des index composites, lu sur l'API d'administration Firestore.
 * `null` quand l'appel échoue : l'appelant doit alors dire qu'il ne sait pas,
 * pas supposer.
 *
 * https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.collectionGroups.indexes
 */
async function etatDesIndex(app: App, projet: string): Promise<EtatIndex | null> {
  try {
    const jeton = await app.options.credential?.getAccessToken();
    if (!jeton) return null;

    const reponse = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projet}/databases/(default)` +
        `/collectionGroups/-/indexes`,
      { headers: { Authorization: `Bearer ${jeton.access_token}` } },
    );

    if (!reponse.ok) return null;

    const donnees = (await reponse.json()) as { indexes?: { state?: string }[] };
    const index = donnees.indexes ?? [];

    return {
      enConstruction: index.filter((entree) => entree.state === 'CREATING').length,
      prets: index.filter((entree) => entree.state === 'READY').length,
    };
  } catch {
    return null;
  }
}

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

  const app = initializeApp({
    credential: cert({ projectId: projet, clientEmail, privateKey: clePrivee.replace(/\\n/g, '\n') }),
    projectId: projet,
  });
  const base = getFirestore(app);

  console.log(`Vérification de ${VERIFICATIONS.length} requêtes sur « ${projet} ».`);

  const echeance = Date.now() + ATTENTE_MAXIMALE_MS;
  let restantes = [...VERIFICATIONS];
  const manquants = new Map<string, string | undefined>();
  let toursAveugles = 0;

  function conclureEnEchec(raison: string): void {
    console.error(`\n${restantes.length} requête(s) sans index — ${raison} :`);
    for (const [nom, adresse] of manquants) {
      console.error(`  MANQUANT  ${nom}`);
      if (adresse) console.error(`            créer : ${adresse}`);
    }
    console.error(
      `\nDéclarez-les dans firestore.indexes.json s'ils n'y sont pas, déployez ` +
        `avec « firebase deploy --only firestore:indexes », puis relancez. Un ` +
        `index déclaré mais non déployé échoue ici exactement comme un index ` +
        `oublié. Ne déployez pas l'application tant que cette vérification échoue.`,
    );
    process.exitCode = 1;
  }

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

    /*
     * FAILED_PRECONDITION ne dit pas si l'index manque ou s'il se construit.
     * On le demande à l'API plutôt que de le supposer : sans construction en
     * cours, attendre ne changera rien et le verdict tombe tout de suite.
     */
    const etat = await etatDesIndex(app, projet);

    if (etat && etat.enConstruction === 0) {
      conclureEnEchec(
        `aucun index n'est en construction sur « ${projet} » (${etat.prets} index prêts)`,
      );
      return;
    }

    if (Date.now() >= echeance) {
      conclureEnEchec(
        etat
          ? `${etat.enConstruction} index encore en construction après ` +
              `${Math.round(ATTENTE_MAXIMALE_MS / 60000)} minutes d'attente`
          : `état des index illisible, attente épuisée`,
      );
      return;
    }

    if (!etat) {
      toursAveugles += 1;
      if (toursAveugles > TOURS_A_L_AVEUGLE) {
        console.error(
          `\nÉtat des index illisible sur « ${projet} » : l'API d'administration ` +
            `n'a pas répondu. Le script ne peut pas distinguer un index absent ` +
            `d'un index en construction, et s'arrête plutôt que d'attendre à ` +
            `l'aveugle.`,
        );
        conclureEnEchec('cause indéterminée');
        return;
      }
      console.log(
        `  ${restantes.length} requête(s) en échec, état des index illisible — ` +
          `nouvelle tentative dans ${PAUSE_MS / 1000} secondes ` +
          `(${toursAveugles}/${TOURS_A_L_AVEUGLE}).`,
      );
    } else {
      console.log(
        `  ${etat.enConstruction} index en construction, ${restantes.length} requête(s) ` +
          `encore en échec — nouvelle tentative dans ${PAUSE_MS / 1000} secondes…`,
      );
    }

    await pause(PAUSE_MS);
  }

  console.log(`\nToutes les requêtes sont couvertes par un index.`);
}

principal().catch((erreur: unknown) => {
  console.error(`\nÉchec de la vérification : ${(erreur as Error).message}`);
  process.exitCode = 1;
});
