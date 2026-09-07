'use client';

import { collection, doc, getDoc, getDocs, orderBy, query, type Timestamp } from 'firebase/firestore';

import { baseDeDonnees } from '@/lib/firebase/client';
import { SYNCHRONISATION_FORMATIONS } from '@/lib/formations/chemins';

/**
 * Lecture du référentiel des formations, depuis le navigateur.
 *
 * **Lecture seule côté application.** La collection est tenue par la
 * synchronisation Airtable ; rien ici n'écrit. Une formation ne se crée ni ne
 * se corrige dans ce back-office, elle se corrige dans Airtable.
 */

export type Formation = {
  id: string;
  nom: string;
  numeroActionDpc: string;
  cibles: string[];
  format: string;
  modalite: string;
  dureeTotale: string;
  urlWebflow: string;
  blocsCertification: string[];
  actif: boolean;
};

export async function chargerFormations(): Promise<Formation[]> {
  const instantane = await getDocs(
    query(collection(baseDeDonnees(), 'formations'), orderBy('nom')),
  );

  return instantane.docs.map((document) => {
    const donnees = document.data();
    return {
      id: document.id,
      nom: typeof donnees.nom === 'string' ? donnees.nom : '',
      numeroActionDpc:
        typeof donnees.numeroActionDpc === 'string' ? donnees.numeroActionDpc : '',
      cibles: Array.isArray(donnees.cibles) ? (donnees.cibles as string[]) : [],
      format: typeof donnees.format === 'string' ? donnees.format : '',
      modalite: typeof donnees.modalite === 'string' ? donnees.modalite : '',
      dureeTotale: typeof donnees.dureeTotale === 'string' ? donnees.dureeTotale : '',
      urlWebflow: typeof donnees.urlWebflow === 'string' ? donnees.urlWebflow : '',
      blocsCertification: Array.isArray(donnees.blocsCertification)
        ? (donnees.blocsCertification as string[])
        : [],
      actif: donnees.actif === true,
    };
  });
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
 * clic sur « Synchroniser » — alors que la tâche planifiée passe toutes les
 * six heures et qu'un enregistrement écarté le reste jusqu'à correction dans
 * Airtable. Un problème qui disparaît au rechargement de la page n'est pas un
 * problème signalé.
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
