/**
 * Renseigne `enonceNormalise` sur les questions qui n'en ont pas.
 *
 * **Pourquoi ce script existe.** Le champ est dérivé de l'énoncé et écrit à
 * chaque enregistrement, mais les questions déjà en base n'en portent pas.
 * Sans lui, elles échappent à la détection de doublons : importer une
 * deuxième fois une question qui existe déjà passerait sans avertissement.
 *
 * **Il ne touche pas à l'énoncé.** Il calcule sa forme normalisée et l'écrit
 * à côté. Rejouable sans effet de bord : la valeur recalculée est la même.
 *
 * Usage :
 *   node --env-file=.env.local scripts/normaliser-enonces.ts
 *   node --env-file=.env.local scripts/normaliser-enonces.ts --faire
 */

import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import { normaliserEnonce } from '../src/lib/texte.ts';

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

async function principal(): Promise<void> {
  const faire = process.argv.includes('--faire');
  const firestore = base();

  const instantane = await firestore.collection('questions').get();
  const aEcrire: { id: string; valeur: string }[] = [];
  let dejaJustes = 0;

  for (const document of instantane.docs) {
    const donnees = document.data();
    const enonce = typeof donnees.enonce === 'string' ? donnees.enonce : '';
    if (enonce === '') continue;

    const attendu = normaliserEnonce(enonce);
    if (donnees.enonceNormalise === attendu) {
      dejaJustes += 1;
      continue;
    }

    aEcrire.push({ id: document.id, valeur: attendu });
  }

  console.log(
    `${instantane.size} question(s) : ${dejaJustes} déjà à jour, ${aEcrire.length} à renseigner.`,
  );

  // Les doublons se voient déjà ici : deux questions, une même forme.
  const parForme = new Map<string, number>();
  for (const document of instantane.docs) {
    const enonce = typeof document.data().enonce === 'string' ? document.data().enonce : '';
    if (enonce === '') continue;
    const forme = normaliserEnonce(enonce);
    parForme.set(forme, (parForme.get(forme) ?? 0) + 1);
  }
  for (const [forme, compte] of parForme) {
    if (compte > 1) console.log(`  doublon x${compte} : « ${forme.slice(0, 70)} »`);
  }

  if (!faire) {
    console.log('\n(essai à blanc — ajouter --faire pour écrire)');
    return;
  }

  for (let debut = 0; debut < aEcrire.length; debut += ECRITURES_PAR_LOT) {
    const lot = firestore.batch();
    for (const { id, valeur } of aEcrire.slice(debut, debut + ECRITURES_PAR_LOT)) {
      lot.update(firestore.collection('questions').doc(id), { enonceNormalise: valeur });
    }
    await lot.commit();
  }

  console.log(`\n${aEcrire.length} question(s) mise(s) à jour.`);
}

await principal();
