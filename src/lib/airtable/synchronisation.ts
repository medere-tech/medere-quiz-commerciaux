import 'server-only';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';

import {
  convertirEnregistrements,
  desactiveraitToutLeCatalogue,
  type Rejet,
} from '@/lib/airtable/conversion';
import { lireFormations } from '@/lib/airtable/client';
import { firestoreAdmin } from '@/lib/firebase/admin';
import { DOCUMENT_ETAT_SYNCHRONISATION } from '@/lib/formations/chemins';
import type { Formation } from '@/lib/airtable/contrat';

/**
 * Synchronisation du référentiel des formations, d'Airtable vers Firestore.
 *
 * Trois règles, dans cet ordre d'importance :
 *
 * 1. **Jamais de suppression.** Des questions sont rattachées aux formations ;
 *    supprimer un document casserait leur affichage. Une formation disparue
 *    d'Airtable passe à `actif: false` et reste en base.
 * 2. **Jamais d'écriture vers Airtable.** Le flux est à sens unique.
 * 3. **Un enregistrement invalide n'emporte pas les autres.** Il est rejeté,
 *    compté, détaillé dans le compte rendu, et les suivants sont écrits.
 *
 * L'identifiant du document Firestore est l'identifiant d'enregistrement
 * Airtable (`rec...`). C'est la clé de rapprochement désignée par
 * docs/airtable-formations.md, et elle rend la synchronisation idempotente :
 * relancée deux fois, elle produit exactement le même état.
 */

const COLLECTION = 'formations';
// Même chemin côté navigateur, où l'écran Formations relit ce compte rendu.
const DOCUMENT_ETAT = DOCUMENT_ETAT_SYNCHRONISATION;

/** Firestore limite une écriture groupée à 500 opérations. */
const TAILLE_LOT = 400;

/**
 * Intervalle minimal entre deux synchronisations déclenchées à la main. La
 * tâche planifiée ne passe qu'une fois par jour, si bien que le bouton du
 * back-office est le vrai recours quand une formation vient d'être corrigée
 * dans Airtable — il reste disponible, mais ne doit pas pouvoir marteler
 * l'API.
 */
export const INTERVALLE_MINIMAL_MS = 5 * 60 * 1000;

/** Interruption volontaire : l'état de la base reste celui d'avant l'appel. */
export class ErreurSynchronisation extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurSynchronisation';
  }
}

export type RapportSynchronisation = {
  lanceeLe: string;
  dureeMs: number;
  luesAirtable: number;
  creees: number;
  misesAJour: number;
  desactivees: number;
  rejetees: number;
  rejets: Rejet[];
  statutsInconnus: string[];
  statutsAbsentsNombre: number;
  statutsAbsents: string[];
  ignoree?: boolean;
  motif?: string;
};

async function derniereExecution(): Promise<Date | null> {
  const etat = await firestoreAdmin().doc(DOCUMENT_ETAT).get();
  if (!etat.exists) return null;

  const valeur = etat.get('lanceeLe');
  if (valeur instanceof Timestamp) return valeur.toDate();
  return null;
}

export async function synchroniserFormations(
  options: { forcer?: boolean } = {},
): Promise<RapportSynchronisation> {
  const debut = Date.now();
  const base = firestoreAdmin();

  if (!options.forcer) {
    const precedente = await derniereExecution();
    if (precedente && Date.now() - precedente.getTime() < INTERVALLE_MINIMAL_MS) {
      const minutes = Math.ceil(INTERVALLE_MINIMAL_MS / 60_000);
      return {
        lanceeLe: new Date().toISOString(),
        dureeMs: Date.now() - debut,
        luesAirtable: 0,
        creees: 0,
        misesAJour: 0,
        desactivees: 0,
        rejetees: 0,
        rejets: [],
        statutsInconnus: [],
        statutsAbsentsNombre: 0,
        statutsAbsents: [],
        ignoree: true,
        motif:
          `Une synchronisation a déjà eu lieu il y a moins de ${minutes} minutes. ` +
          `Le référentiel Airtable ne change pas si vite.`,
      };
    }
  }

  const syncLe = new Date();
  const enregistrements = await lireFormations();
  const { formations, rejets, statutsInconnus, statutsAbsents } = convertirEnregistrements(
    enregistrements,
    syncLe,
  );

  const existantes = await base.collection(COLLECTION).get();
  const identifiantsExistants = new Set(existantes.docs.map((document) => document.id));

  // Garde-fou : une réponse vide désactiverait tout le catalogue d'un coup.
  // Une table momentanément filtrée, une vue modifiée, un incident côté
  // Airtable — et plus une seule formation ne serait proposée aux commerciaux.
  // Aucune suppression n'aurait eu lieu, mais le résultat visible serait le
  // même. On préfère ne rien faire et le dire.
  if (desactiveraitToutLeCatalogue(formations.length, existantes.size)) {
    throw new ErreurSynchronisation(
      `Airtable n'a renvoyé aucune formation exploitable alors que ` +
        `${existantes.size} sont enregistrées. La synchronisation est ` +
        `interrompue sans rien modifier : désactiver tout le catalogue sur ` +
        `une réponse vide serait pire que de ne pas se synchroniser. ` +
        `Vérifiez la table Formations, puis relancez.` +
        (rejets.length > 0
          ? ` ${rejets.length} enregistrement(s) ont par ailleurs été rejetés.`
          : ''),
    );
  }

  let creees = 0;
  let misesAJour = 0;

  let lot = base.batch();
  let compteur = 0;

  const executerSiPlein = async (): Promise<void> => {
    if (compteur >= TAILLE_LOT) {
      await lot.commit();
      lot = base.batch();
      compteur = 0;
    }
  };

  for (const formation of formations) {
    if (identifiantsExistants.has(formation.airtableId)) misesAJour += 1;
    else creees += 1;

    // Écriture complète et non fusionnée : le document reflète exactement
    // Airtable, sans champ résiduel d'une version précédente du modèle.
    lot.set(base.collection(COLLECTION).doc(formation.airtableId), enDocument(formation));
    compteur += 1;
    await executerSiPlein();
  }

  // Ce qui a disparu d'Airtable est désactivé, jamais supprimé.
  const vues = new Set(formations.map((formation) => formation.airtableId));
  let desactivees = 0;

  for (const document of existantes.docs) {
    if (vues.has(document.id)) continue;
    if (document.get('actif') === false) continue;

    lot.update(document.ref, { actif: false, syncLe: FieldValue.serverTimestamp() });
    desactivees += 1;
    compteur += 1;
    await executerSiPlein();
  }

  if (compteur > 0) await lot.commit();

  const rapport: RapportSynchronisation = {
    lanceeLe: syncLe.toISOString(),
    dureeMs: Date.now() - debut,
    luesAirtable: enregistrements.length,
    creees,
    misesAJour,
    desactivees,
    rejetees: rejets.length,
    rejets,
    statutsInconnus,
    statutsAbsentsNombre: statutsAbsents.length,
    statutsAbsents,
  };

  await base.doc(DOCUMENT_ETAT).set({
    lanceeLe: Timestamp.fromDate(syncLe),
    dureeMs: rapport.dureeMs,
    luesAirtable: rapport.luesAirtable,
    creees,
    misesAJour,
    desactivees,
    rejetees: rejets.length,
    // Détail borné : le compte rendu sert à réparer, pas à tout archiver.
    rejets: rejets.slice(0, 20),
    statutsInconnus,
    statutsAbsentsNombre: statutsAbsents.length,
    statutsAbsents: statutsAbsents.slice(0, 50),
  });

  return rapport;
}

function enDocument(formation: Formation): Record<string, unknown> {
  return {
    airtableId: formation.airtableId,
    numeroActionDpc: formation.numeroActionDpc,
    nom: formation.nom,
    cibles: formation.cibles,
    format: formation.format,
    modalite: formation.modalite,
    blocsCertification: formation.blocsCertification,
    dureeTotale: formation.dureeTotale,
    urlWebflow: formation.urlWebflow,
    actif: formation.actif,
    syncLe: Timestamp.fromDate(formation.syncLe),
  };
}
