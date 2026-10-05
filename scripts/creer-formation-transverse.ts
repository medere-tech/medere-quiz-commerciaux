/**
 * Crée — ou recrée à l'identique — la formation transverse
 * « DPC et réglementation ».
 *
 * Elle ne vient pas d'Airtable, qui reste en lecture seule : ce script est
 * la seule façon de la faire exister. Voir `src/lib/formations/transverse.ts`
 * pour ce qu'elle est et pourquoi.
 *
 * **Rejouable sans effet de bord.** Il écrit toujours le même document,
 * complet. Relancé sur une base où elle existe déjà, il la remet dans son
 * état de référence — y compris `actif: true` si quelqu'un l'avait désactivée.
 * C'est aussi lui qu'on relance si la base est un jour vidée : contrairement
 * au reste de `formations`, ce document ne se reconstruit pas par
 * synchronisation.
 *
 * **Il vise la base réelle.** Il refuse de tourner avec l'émulateur, et
 * n'écrit rien sans `--faire`.
 *
 * Usage :
 *   node --env-file=.env.local scripts/creer-formation-transverse.ts
 *   node --env-file=.env.local scripts/creer-formation-transverse.ts --faire
 */

import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';

import {
  ID_FORMATION_TRANSVERSE,
  NOM_FORMATION_TRANSVERSE,
} from '../src/lib/formations/transverse.ts';

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

/**
 * Le document, champ pour champ. Mêmes champs qu'une formation synchronisée,
 * plus `transverse`. Ce qui n'a pas de sens ici reste vide plutôt qu'inventé :
 * pas de numéro d'action DPC, pas d'identifiant Airtable, pas de public — elle
 * concerne tous les publics, et une liste exhaustive mentirait dès qu'un
 * public s'ajoute au catalogue.
 */
function documentTransverse(): Record<string, unknown> {
  return {
    airtableId: '',
    numeroActionDpc: '',
    nom: NOM_FORMATION_TRANSVERSE,
    cibles: [],
    format: '',
    modalite: '',
    blocsCertification: [],
    dureeTotale: '',
    urlWebflow: '',
    // Elle ne relève d'aucun sujet : elle n'a pas de page, et sa ligne
    // d'avancement ne mène nulle part.
    sujetId: null,
    actif: true,
    transverse: true,
    syncLe: FieldValue.serverTimestamp(),
  };
}

async function principal(): Promise<void> {
  const faire = process.argv.includes('--faire');
  const reference = base().collection('formations').doc(ID_FORMATION_TRANSVERSE);
  const existant = await reference.get();

  console.log(
    existant.exists
      ? `formations/${ID_FORMATION_TRANSVERSE} existe déjà (actif : ${String(existant.get('actif'))}). ` +
          'Il sera réécrit à l’identique.'
      : `formations/${ID_FORMATION_TRANSVERSE} n’existe pas. Il sera créé.`,
  );

  if (!faire) {
    console.log('Essai à blanc : rien n’a été écrit. Relancez avec --faire.');
    return;
  }

  await reference.set(documentTransverse());
  const relu = await reference.get();
  console.log(
    `Écrit. Relu : « ${String(relu.get('nom'))} », actif : ${String(relu.get('actif'))}, ` +
      `transverse : ${String(relu.get('transverse'))}.`,
  );
}

principal().catch((erreur: unknown) => {
  console.error(erreur instanceof Error ? erreur.message : erreur);
  process.exitCode = 1;
});
