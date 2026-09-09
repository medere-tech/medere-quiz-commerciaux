'use client';

import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type QueryConstraint,
  type QueryDocumentSnapshot,
  type Timestamp,
} from 'firebase/firestore';

import { baseDeDonnees } from '@/lib/firebase/firestore';
import { enFormation, type Formation } from '@/lib/formations/lecture';
import { SYNCHRONISATION_FORMATIONS } from '@/lib/formations/chemins';

export type { Formation } from '@/lib/formations/lecture';

/**
 * Lecture du référentiel des formations, depuis le navigateur.
 *
 * **Lecture seule côté application.** La collection est tenue par la
 * synchronisation Airtable ; rien ici n'écrit. Une formation ne se crée ni ne
 * se corrige dans ce back-office, elle se corrige dans Airtable.
 *
 * **Deux lectures, deux usages.** `chargerFormations` rapatrie le référentiel
 * entier : les écrans qui rattachent une question à sa formation ont besoin de
 * toutes les entrées, actives ou non, pour nommer celle qui est déjà liée.
 * `chargerPageFormations` sert la liste du back-office, filtrée et paginée par
 * Firestore.
 */

/** Ce que l'onglet du back-office demande au serveur. */
export type FiltreFormations = 'actives' | 'inactives' | 'toutes';

export type PageFormations = {
  formations: Formation[];
  curseur: QueryDocumentSnapshot | null;
  encore: boolean;
};

function contraintesFormations(filtre: FiltreFormations): QueryConstraint[] {
  const liste: QueryConstraint[] = [];
  if (filtre === 'actives') liste.push(where('actif', '==', true));
  if (filtre === 'inactives') liste.push(where('actif', '==', false));
  liste.push(orderBy('nom'));
  return liste;
}

export async function chargerPageFormations(
  filtre: FiltreFormations,
  taille: number,
  apres?: QueryDocumentSnapshot | null,
): Promise<PageFormations> {
  const suite = apres ? [startAfter(apres)] : [];

  const instantane = await getDocs(
    query(
      collection(baseDeDonnees(), 'formations'),
      ...contraintesFormations(filtre),
      ...suite,
      limit(taille),
    ),
  );

  return {
    formations: instantane.docs.map((document) => enFormation(document.id, document.data())),
    curseur: instantane.docs.at(-1) ?? null,
    encore: instantane.size === taille,
  };
}

/**
 * L'ensemble filtré, pour la recherche plein texte. Firestore ne sait chercher
 * ni dans un nom, ni dans une liste de cibles : la recherche s'applique donc à
 * ce que le filtre serveur a déjà réduit. Le référentiel tient en quelques
 * centaines d'entrées, il n'y a pas de plafond à poser.
 */
export async function chargerToutesLesFormations(
  filtre: FiltreFormations,
): Promise<Formation[]> {
  const instantane = await getDocs(
    query(collection(baseDeDonnees(), 'formations'), ...contraintesFormations(filtre)),
  );

  return instantane.docs.map((document) => enFormation(document.id, document.data()));
}

export async function compterFormations(filtre: FiltreFormations): Promise<number> {
  const liste: QueryConstraint[] = [];
  if (filtre === 'actives') liste.push(where('actif', '==', true));
  if (filtre === 'inactives') liste.push(where('actif', '==', false));

  const agregat = await getCountFromServer(
    query(collection(baseDeDonnees(), 'formations'), ...liste),
  );

  return agregat.data().count;
}

export async function chargerFormations(): Promise<Formation[]> {
  const instantane = await getDocs(
    query(collection(baseDeDonnees(), 'formations'), orderBy('nom')),
  );

  return instantane.docs.map((document) => enFormation(document.id, document.data()));
}

/**
 * Teinte et forme de la marque associées à une formation, dérivées de son
 * public. Le repère d'une formation est sa forme, jamais une puce colorée —
 * c'est une règle du système de design, pas une préférence.
 *
 * Les sept formes sont celles du système, livrées déjà teintées, dans
 * `public/formes/`.
 */
const IDENTITES: Record<string, { fichier: string; couleur: string }> = {
  'médecin généraliste': { fichier: 'forme-1-006E90.svg', couleur: 'var(--specialty-general)' },
  'chirurgien dentiste': { fichier: 'forme-2-FECA45.svg', couleur: 'var(--specialty-dentist)' },
  pédiatre: { fichier: 'forme-3-17BEBB.svg', couleur: 'var(--specialty-pediatrician)' },
  radiologue: { fichier: 'forme-4-F19953.svg', couleur: 'var(--specialty-radiologist)' },
  gynécologue: { fichier: 'forme-5-D87DA9.svg', couleur: 'var(--specialty-gynecologist)' },
  psychiatre: { fichier: 'forme-6-9F84BD.svg', couleur: 'var(--specialty-psychiatrist)' },
  autres: { fichier: 'forme-7-2DA131.svg', couleur: 'var(--specialty-others)' },
};

const IDENTITE_PAR_DEFAUT = IDENTITES['médecin généraliste'] as {
  fichier: string;
  couleur: string;
};

export function identiteVisuelle(formation: Formation): { fichier: string; couleur: string } {
  const premiere = (formation.cibles[0] ?? '').toLowerCase();
  return IDENTITES[premiere] ?? IDENTITE_PAR_DEFAUT;
}

/**
 * Compte rendu de la dernière synchronisation Airtable.
 *
 * Écrit par la route serveur (SDK Admin), relu ici. Sans cette lecture, le
 * détail des rejets ne s'afficherait que dans les secondes qui suivent un
 * clic sur « Synchroniser » — alors que la tâche planifiée ne passe qu'une
 * fois par jour et qu'un enregistrement écarté le reste jusqu'à correction
 * dans Airtable. Un problème qui disparaît au rechargement de la page n'est
 * pas un problème signalé.
 *
 * Les listes sont bornées à l'écriture : `rejetees` et `statutsAbsentsNombre`
 * portent le compte réel, `rejets` et `statutsAbsents` au plus 20 et 50
 * éléments. L'écran doit lire les compteurs, jamais la taille des listes.
 */
export type RapportSynchronisation = {
  lanceeLe: Date | null;
  luesAirtable: number;
  creees: number;
  misesAJour: number;
  desactivees: number;
  rejetees: number;
  rejets: { airtableId: string; nom: string; raisons: string[] }[];
  statutsInconnus: string[];
  statutsAbsentsNombre: number;
  statutsAbsents: string[];
};

function nombre(valeur: unknown): number {
  return typeof valeur === 'number' && Number.isFinite(valeur) ? valeur : 0;
}

function textes(valeur: unknown): string[] {
  return Array.isArray(valeur) ? valeur.filter((e): e is string => typeof e === 'string') : [];
}

export function enRapport(donnees: Record<string, unknown>): RapportSynchronisation {
  const rejets = Array.isArray(donnees.rejets) ? donnees.rejets : [];

  return {
    lanceeLe:
      donnees.lanceeLe && typeof (donnees.lanceeLe as Timestamp).toDate === 'function'
        ? (donnees.lanceeLe as Timestamp).toDate()
        : null,
    luesAirtable: nombre(donnees.luesAirtable),
    creees: nombre(donnees.creees),
    misesAJour: nombre(donnees.misesAJour),
    desactivees: nombre(donnees.desactivees),
    rejetees: nombre(donnees.rejetees),
    rejets: rejets.map((rejet) => {
      const brut = (rejet ?? {}) as Record<string, unknown>;
      return {
        airtableId: typeof brut.airtableId === 'string' ? brut.airtableId : '',
        nom: typeof brut.nom === 'string' ? brut.nom : '',
        raisons: textes(brut.raisons),
      };
    }),
    statutsInconnus: textes(donnees.statutsInconnus),
    statutsAbsentsNombre: nombre(donnees.statutsAbsentsNombre),
    statutsAbsents: textes(donnees.statutsAbsents),
  };
}

export async function chargerDernierRapport(): Promise<RapportSynchronisation | null> {
  const document = await getDoc(
    doc(
      baseDeDonnees(),
      SYNCHRONISATION_FORMATIONS.collection,
      SYNCHRONISATION_FORMATIONS.document,
    ),
  );
  return document.exists() ? enRapport(document.data()) : null;
}
