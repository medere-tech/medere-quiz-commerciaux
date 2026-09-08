/**
 * Reprise d'historique de `questionStats`.
 *
 * **Pourquoi ce script existe.** La Cloud Function n'agrège que les réponses
 * créées après son déploiement. Les réponses déjà en base — celles des
 * recettes, et toutes celles enregistrées avant la mise en service de
 * l'agrégation — resteraient invisibles : Noémie ouvrirait un écran de
 * statistiques vide alors que l'équipe a répondu des centaines de fois. Ce
 * script reconstruit les compteurs à partir des réponses existantes.
 *
 * **Il recalcule, il n'incrémente pas.** Chaque agrégat est réécrit en
 * entier, donc le script est rejouable sans fausser les compteurs. C'est
 * aussi ce qui le rend dangereux à chaud : lancé pendant que la fonction
 * tourne, il peut écraser un incrément arrivé entre la lecture et
 * l'écriture. À lancer une fois, avant ou juste après le déploiement de la
 * fonction, pas en routine.
 *
 * **Aucun identifiant d'utilisateur n'est écrit.** Le script parcourt les
 * réponses par utilisateur pour les lire, et n'en retient que
 * `questionId` et `correcte` — exactement ce que reçoit la fonction.
 *
 * Usage :
 *   node --env-file=.env.local scripts/agreger-historique.ts
 *   node --env-file=.env.local scripts/agreger-historique.ts --faire
 *
 * Sans `--faire`, le script se contente d'afficher ce qu'il écrirait.
 */

import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

type Cumul = { tentatives: number; echecs: number };

const ECRITURES_PAR_LOT = 400;

function base(): Firestore {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      'FIRESTORE_EMULATOR_HOST est défini : ce script vise la base réelle, ' +
        'pas l’émulateur. Retirez la variable et relancez.',
    );
  }

  const app = initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
    }),
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
  });

  return getFirestore(app);
}

/**
 * Parcourt `users/{uid}/reponses` utilisateur par utilisateur, plutôt qu'en
 * requête de groupe de collections. Deux raisons : la portée reste explicite
 * — les réponses de session du lot 7 vivront ailleurs et ne doivent pas être
 * ramassées par accident — et aucun index de groupe n'est requis.
 */
async function cumuler(firestore: Firestore): Promise<{
  cumuls: Map<string, Cumul>;
  reponses: number;
  utilisateurs: number;
}> {
  const cumuls = new Map<string, Cumul>();
  let reponses = 0;

  const utilisateurs = await firestore.collection('users').listDocuments();

  for (const utilisateur of utilisateurs) {
    const instantane = await utilisateur.collection('reponses').get();

    for (const document of instantane.docs) {
      const donnees = document.data();
      const questionId = donnees.questionId;
      const correcte = donnees.correcte;

      if (typeof questionId !== 'string' || questionId === '') continue;
      if (typeof correcte !== 'boolean') continue;

      const cumul = cumuls.get(questionId) ?? { tentatives: 0, echecs: 0 };
      cumul.tentatives += 1;
      if (!correcte) cumul.echecs += 1;
      cumuls.set(questionId, cumul);
      reponses += 1;
    }
  }

  return { cumuls, reponses, utilisateurs: utilisateurs.length };
}

async function ecrire(firestore: Firestore, cumuls: Map<string, Cumul>): Promise<void> {
  const entrees = [...cumuls.entries()];

  for (let debut = 0; debut < entrees.length; debut += ECRITURES_PAR_LOT) {
    const lot = firestore.batch();

    for (const [questionId, cumul] of entrees.slice(debut, debut + ECRITURES_PAR_LOT)) {
      lot.set(firestore.collection('questionStats').doc(questionId), {
        tentatives: cumul.tentatives,
        echecs: cumul.echecs,
        majLe: new Date(),
      });
    }

    await lot.commit();
  }
}

async function principal(): Promise<void> {
  const faire = process.argv.includes('--faire');
  const firestore = base();

  const { cumuls, reponses, utilisateurs } = await cumuler(firestore);

  console.log(
    `${reponses} réponse(s) lue(s) chez ${utilisateurs} utilisateur(s), ` +
      `${cumuls.size} question(s) concernée(s).`,
  );

  const classees = [...cumuls.entries()]
    .map(([questionId, cumul]) => ({
      questionId,
      ...cumul,
      taux: Math.round((cumul.echecs / cumul.tentatives) * 100),
    }))
    .sort((a, b) => b.taux - a.taux || b.tentatives - a.tentatives);

  for (const ligne of classees.slice(0, 10)) {
    console.log(
      `  ${ligne.taux.toString().padStart(3)} %  ${ligne.echecs}/${ligne.tentatives}  ${ligne.questionId}`,
    );
  }
  if (classees.length > 10) console.log(`  … et ${classees.length - 10} autre(s).`);

  if (!faire) {
    console.log('\n(essai à blanc — ajouter --faire pour écrire dans questionStats)');
    return;
  }

  await ecrire(firestore, cumuls);
  console.log(`\n${cumuls.size} agrégat(s) réécrit(s) dans questionStats.`);
}

await principal();
