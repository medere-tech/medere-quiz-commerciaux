/**
 * Reconstruction des états par question, à partir des réponses.
 *
 * **Pourquoi ce script existe.** `users/{uid}/etats` est tenu à jour à chaque
 * réponse, mais il n'existe qu'à partir de sa mise en service : les réponses
 * déjà en base n'ont pas d'état. Sans reprise, un commercial qui s'entraîne
 * depuis des semaines repartirait d'une maîtrise à zéro, et le tirage lui
 * resservirait des questions déjà acquises comme si elles étaient neuves.
 *
 * **Il recalcule, il n'incrémente pas.** Chaque état est réécrit en entier
 * depuis l'historique complet de la question : le script est rejouable, et
 * c'est aussi le filet quand un état dérive de ses réponses. En revanche il
 * ne doit pas tourner pendant qu'un commercial répond — une réponse arrivée
 * entre la lecture et l'écriture serait perdue pour l'état, pas pour
 * l'historique.
 *
 * Usage :
 *   node --env-file=.env.local scripts/reconstruire-etats.ts
 *   node --env-file=.env.local scripts/reconstruire-etats.ts --faire
 */

import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore, type Timestamp } from 'firebase-admin/firestore';

type Tentative = { correcte: boolean; instant: number };
type Etat = { reussies: number; tentatives: number; derniereRatee: boolean };

const ECRITURES_PAR_LOT = 400;

function base(): Firestore {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      'FIRESTORE_EMULATOR_HOST est défini : ce script vise la base réelle, ' +
        'pas l’émulateur. Retirez la variable et relancez.',
    );
  }

  return getFirestore(
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
      }),
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
    }),
  );
}

function instantDe(valeur: unknown): number {
  const horodatage = valeur as Timestamp | undefined;
  // Une réponse sans horodatage vient d'être écrite : elle est la plus
  // récente. C'est la même convention que le calcul du navigateur.
  return typeof horodatage?.toMillis === 'function' ? horodatage.toMillis() : Number.MAX_SAFE_INTEGER;
}

/** L'état d'une question, tel que les réponses le décrivent. */
export function etatDepuisTentatives(tentatives: Tentative[]): Etat {
  const ordonnees = [...tentatives].sort((a, b) => a.instant - b.instant);
  const derniere = ordonnees[ordonnees.length - 1];

  return {
    reussies: ordonnees.filter((tentative) => tentative.correcte).length,
    tentatives: ordonnees.length,
    derniereRatee: derniere ? !derniere.correcte : false,
  };
}

async function principal(): Promise<void> {
  const faire = process.argv.includes('--faire');
  const firestore = base();

  const utilisateurs = await firestore.collection('users').listDocuments();
  let reponsesLues = 0;
  let etatsEcrits = 0;

  for (const utilisateur of utilisateurs) {
    const instantane = await utilisateur.collection('reponses').get();
    const parQuestion = new Map<string, Tentative[]>();

    for (const document of instantane.docs) {
      const donnees = document.data();
      const questionId = donnees.questionId;
      if (typeof questionId !== 'string' || questionId === '') continue;
      if (typeof donnees.correcte !== 'boolean') continue;

      const liste = parQuestion.get(questionId) ?? [];
      liste.push({ correcte: donnees.correcte, instant: instantDe(donnees.repondueLe) });
      parQuestion.set(questionId, liste);
      reponsesLues += 1;
    }

    console.log(
      `  ${utilisateur.id} : ${instantane.size} réponse(s) → ${parQuestion.size} état(s)`,
    );

    if (!faire) continue;

    const entrees = [...parQuestion.entries()];
    for (let debut = 0; debut < entrees.length; debut += ECRITURES_PAR_LOT) {
      const lot = firestore.batch();

      for (const [questionId, tentatives] of entrees.slice(debut, debut + ECRITURES_PAR_LOT)) {
        lot.set(utilisateur.collection('etats').doc(questionId), {
          ...etatDepuisTentatives(tentatives),
          majLe: new Date(),
        });
      }

      await lot.commit();
      etatsEcrits += Math.min(ECRITURES_PAR_LOT, entrees.length - debut);
    }
  }

  console.log(
    `\n${reponsesLues} réponse(s) lue(s) chez ${utilisateurs.length} utilisateur(s).`,
  );

  if (!faire) {
    console.log('(essai à blanc — ajouter --faire pour écrire les états)');
    return;
  }

  console.log(`${etatsEcrits} état(s) écrit(s).`);
}

await principal();
