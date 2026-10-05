import 'server-only';

import { FieldValue, Timestamp, type DocumentReference } from 'firebase-admin/firestore';

import {
  convertirEnregistrements,
  convertirSujets,
  desactiveraitToutLeCatalogue,
  formationsADesactiver,
  formationsDuMiroir,
  rattacherAuxSujets,
  sujetsADesactiver,
  type FormationEnregistree,
  type Rejet,
} from '@/lib/airtable/conversion';
import { lireFormations, lireSujets } from '@/lib/airtable/client';
import { firestoreAdmin } from '@/lib/firebase/admin';
import { DOCUMENT_ETAT_SYNCHRONISATION } from '@/lib/formations/chemins';
import type { Formation, Sujet } from '@/lib/airtable/contrat';

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
/*
 * Le miroir de la table Sujets. Écrit ici, et seulement ici, par un `set`
 * complet chaque nuit : rien de ce que l'équipe saisit ne doit y vivre. La
 * présentation d'un sujet est donc rangée à part, sous `presentations/`, que
 * la synchronisation ne touche jamais.
 */
const COLLECTION_SUJETS = 'sujets';
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
  sujetsLus: number;
  sujetsDesactives: number;
  /** Fiches dont le sujet n'a pas été lu : écrites sans sujet. */
  sujetsIntrouvables: string[];
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
        sujetsLus: 0,
        sujetsDesactives: 0,
        sujetsIntrouvables: [],
        ignoree: true,
        motif:
          `Une synchronisation a déjà eu lieu il y a moins de ${minutes} minutes. ` +
          `Le référentiel Airtable ne change pas si vite.`,
      };
    }
  }

  const syncLe = new Date();
  const enregistrements = await lireFormations();
  const conversion = convertirEnregistrements(enregistrements, syncLe);
  const { statutsInconnus, statutsAbsents } = conversion;

  const enregistrementsSujets = await lireSujets();
  const { sujets, rejets: rejetsSujets } = convertirSujets(enregistrementsSujets, syncLe);
  const { formations, sujetsIntrouvables } = rattacherAuxSujets(conversion.formations, sujets);
  const rejets = [...conversion.rejets, ...rejetsSujets];

  const [existantes, sujetsExistants] = await Promise.all([
    base.collection(COLLECTION).get(),
    base.collection(COLLECTION_SUJETS).select('actif').get(),
  ]);
  const identifiantsExistants = new Set(existantes.docs.map((document) => document.id));
  const enregistrees: (FormationEnregistree & { ref: DocumentReference })[] = existantes.docs.map(
    (document) => ({
      id: document.id,
      actif: document.get('actif'),
      transverse: document.get('transverse'),
      ref: document.ref,
    }),
  );
  // La formation transverse ne vient pas d'Airtable : elle ne compte pas dans
  // le miroir. Voir `formationsDuMiroir`.
  const duMiroir = formationsDuMiroir(enregistrees).length;

  // Garde-fou : une réponse vide désactiverait tout le catalogue d'un coup.
  // Une table momentanément filtrée, une vue modifiée, un incident côté
  // Airtable — et plus une seule formation ne serait proposée aux commerciaux.
  // Aucune suppression n'aurait eu lieu, mais le résultat visible serait le
  // même. On préfère ne rien faire et le dire.
  if (desactiveraitToutLeCatalogue(formations.length, duMiroir)) {
    throw new ErreurSynchronisation(
      `Airtable n'a renvoyé aucune formation exploitable alors que ` +
        `${duMiroir} sont enregistrées. La synchronisation est ` +
        `interrompue sans rien modifier : désactiver tout le catalogue sur ` +
        `une réponse vide serait pire que de ne pas se synchroniser. ` +
        `Vérifiez la table Formations, puis relancez.` +
        (rejets.length > 0
          ? ` ${rejets.length} enregistrement(s) ont par ailleurs été rejetés.`
          : ''),
    );
  }

  /*
   * Le même garde-fou pour les sujets, et pour une raison de plus : une table
   * Sujets lue vide ne désactiverait pas seulement les sujets, elle laisserait
   * chaque fiche sans sujet — toutes les pages de sujet disparaîtraient d'un
   * coup, sans qu'aucune fiche n'ait changé dans Airtable.
   */
  const sujetsEnregistres = sujetsExistants.docs.map((document) => ({
    id: document.id,
    actif: document.get('actif'),
    ref: document.ref,
  }));
  if (desactiveraitToutLeCatalogue(sujets.length, sujetsEnregistres.length)) {
    throw new ErreurSynchronisation(
      `Airtable n'a renvoyé aucun sujet exploitable alors que ` +
        `${sujetsEnregistres.length} sont enregistrés. La synchronisation est ` +
        `interrompue sans rien modifier : toutes les fiches perdraient leur sujet. ` +
        `Vérifiez la table Sujets, puis relancez.`,
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

  // Ce qui a disparu d'Airtable est désactivé, jamais supprimé. La formation
  // transverse, qui n'y a jamais été, est laissée telle quelle.
  const vues = new Set(formations.map((formation) => formation.airtableId));
  let desactivees = 0;

  for (const document of formationsADesactiver(enregistrees, vues)) {
    lot.update(document.ref, { actif: false, syncLe: FieldValue.serverTimestamp() });
    desactivees += 1;
    compteur += 1;
    await executerSiPlein();
  }

  for (const sujet of sujets) {
    lot.set(base.collection(COLLECTION_SUJETS).doc(sujet.airtableId), enDocumentSujet(sujet));
    compteur += 1;
    await executerSiPlein();
  }

  const sujetsVus = new Set(sujets.map((sujet) => sujet.airtableId));
  let sujetsDesactives = 0;

  for (const document of sujetsADesactiver(sujetsEnregistres, sujetsVus)) {
    lot.update(document.ref, { actif: false, syncLe: FieldValue.serverTimestamp() });
    sujetsDesactives += 1;
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
    sujetsLus: enregistrementsSujets.length,
    sujetsDesactives,
    sujetsIntrouvables,
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
    sujetsLus: rapport.sujetsLus,
    sujetsDesactives,
    sujetsIntrouvables: sujetsIntrouvables.slice(0, 50),
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
    sujetId: formation.sujetId,
    actif: formation.actif,
    syncLe: Timestamp.fromDate(formation.syncLe),
  };
}

function enDocumentSujet(sujet: Sujet): Record<string, unknown> {
  return {
    airtableId: sujet.airtableId,
    nom: sujet.nom,
    actif: sujet.actif,
    syncLe: Timestamp.fromDate(sujet.syncLe),
  };
}
