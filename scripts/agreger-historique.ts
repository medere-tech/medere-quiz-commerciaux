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
 * **Les comptes administrateurs sont écartés**, comme dans la Cloud Function
 * et pour la même raison : l'équipe pédagogique parcourt le quiz pour relire
 * ses propres explications, y répond juste, et fausserait à la baisse le taux
 * d'échec des questions qu'elle inspecte. Le rôle est lu sur le custom claim,
 * seule source qui fasse autorité. L'identifiant sert à décider, jamais à
 * écrire.
 *
 * L'essai à blanc affiche la comparaison avec les compteurs actuellement en
 * base : on voit ce que la réécriture changerait avant de la lancer.
 *
 * Usage :
 *   node --env-file=.env.local scripts/agreger-historique.ts
 *   node --env-file=.env.local scripts/agreger-historique.ts --faire
 *
 * Sans `--faire`, le script se contente d'afficher ce qu'il écrirait.
 */

import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import { estAdministrateur } from '../functions/src/agregation.ts';

type Cumul = { tentatives: number; echecs: number };

const ECRITURES_PAR_LOT = 400;

function connexion(): { firestore: Firestore; auth: Auth } {
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

  return { firestore: getFirestore(app), auth: getAuth(app) };
}

/**
 * Parcourt `users/{uid}/reponses` utilisateur par utilisateur, plutôt qu'en
 * requête de groupe de collections. Deux raisons : la portée reste explicite
 * — les réponses de session du lot 7 vivront ailleurs et ne doivent pas être
 * ramassées par accident — et aucun index de groupe n'est requis.
 */
async function cumuler(
  firestore: Firestore,
  auth: Auth,
): Promise<{
  cumuls: Map<string, Cumul>;
  reponses: number;
  utilisateurs: number;
  administrateurs: number;
  reponsesEcartees: number;
}> {
  const cumuls = new Map<string, Cumul>();
  let reponses = 0;
  let administrateurs = 0;
  let reponsesEcartees = 0;

  const utilisateurs = await firestore.collection('users').listDocuments();

  for (const utilisateur of utilisateurs) {
    const instantane = await utilisateur.collection('reponses').get();

    // Le rôle vient du claim, pas du champ `role` du document utilisateur —
    // celui-là n'existe que pour l'affichage. Aucune erreur n'est attrapée :
    // si l'Auth ne répond pas, on ne sait pas qui a répondu, et un
    // recomptage qui devine ne vaut rien.
    const compte = await auth.getUser(utilisateur.id);

    if (estAdministrateur(compte.customClaims)) {
      administrateurs += 1;
      reponsesEcartees += instantane.size;
      continue;
    }

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

  return {
    cumuls,
    reponses,
    utilisateurs: utilisateurs.length,
    administrateurs,
    reponsesEcartees,
  };
}

/** Ce que `questionStats` contient avant réécriture, pour la comparaison. */
async function lireAgregatsActuels(firestore: Firestore): Promise<Map<string, Cumul>> {
  const actuels = new Map<string, Cumul>();
  const instantane = await firestore.collection('questionStats').get();

  for (const document of instantane.docs) {
    const donnees = document.data();
    actuels.set(document.id, {
      tentatives: typeof donnees.tentatives === 'number' ? donnees.tentatives : 0,
      echecs: typeof donnees.echecs === 'number' ? donnees.echecs : 0,
    });
  }

  return actuels;
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
  const { firestore, auth } = connexion();

  const { cumuls, reponses, utilisateurs, administrateurs, reponsesEcartees } =
    await cumuler(firestore, auth);
  const actuels = await lireAgregatsActuels(firestore);

  console.log(
    `${reponses} réponse(s) retenue(s) chez ${utilisateurs - administrateurs} ` +
      `commercial(aux), ${cumuls.size} question(s) concernée(s).`,
  );
  console.log(
    `${administrateurs} compte(s) administrateur(s) écarté(s), ` +
      `${reponsesEcartees} réponse(s) tenue(s) hors de l'agrégat.`,
  );

  // La comparaison est le cœur de l'essai à blanc : elle dit ce que la
  // réécriture changerait, question par question.
  const identifiants = new Set([...cumuls.keys(), ...actuels.keys()]);
  const ecarts = [...identifiants]
    .map((questionId) => {
      const apres = cumuls.get(questionId) ?? { tentatives: 0, echecs: 0 };
      const avant = actuels.get(questionId) ?? { tentatives: 0, echecs: 0 };
      return { questionId, avant, apres };
    })
    .filter(
      ({ avant, apres }) =>
        avant.tentatives !== apres.tentatives || avant.echecs !== apres.echecs,
    );

  const taux = ({ tentatives, echecs }: Cumul): string =>
    tentatives === 0 ? '  —' : `${Math.round((echecs / tentatives) * 100)} %`.padStart(4);

  console.log();
  if (ecarts.length === 0) {
    console.log('Aucun écart : les compteurs en base sont déjà ceux que ce script produirait.');
  } else {
    console.log(`${ecarts.length} question(s) dont les compteurs changent :`);
    console.log(
      '  ' +
        'question'.padEnd(24) +
        'avant'.padStart(14) +
        'après'.padStart(14) +
        '   taux',
    );
    for (const { questionId, avant, apres } of ecarts.slice(0, 25)) {
      console.log(
        '  ' +
          questionId.slice(0, 23).padEnd(24) +
          `${avant.echecs}/${avant.tentatives}`.padStart(14) +
          `${apres.echecs}/${apres.tentatives}`.padStart(14) +
          `   ${taux(avant)} → ${taux(apres)}`,
      );
    }
    if (ecarts.length > 25) console.log(`  … et ${ecarts.length - 25} autre(s).`);
  }

  if (!faire) {
    console.log();
    console.log('(essai à blanc — ajouter --faire pour écrire dans questionStats)');
    return;
  }

  await ecrire(firestore, cumuls);
  console.log();
  console.log(`${cumuls.size} agrégat(s) réécrit(s) dans questionStats.`);

  // Une question dont toutes les réponses venaient d'un administrateur n'a
  // plus de compteur à écrire : son agrégat resterait en base avec ses
  // anciens chiffres. On le retire, sinon la réécriture serait partielle.
  const orphelins = [...actuels.keys()].filter((questionId) => !cumuls.has(questionId));
  for (const questionId of orphelins) {
    await firestore.collection('questionStats').doc(questionId).delete();
  }
  if (orphelins.length > 0) {
    console.log(`${orphelins.length} agrégat(s) devenu(s) sans réponse, supprimé(s).`);
  }
}

await principal();
