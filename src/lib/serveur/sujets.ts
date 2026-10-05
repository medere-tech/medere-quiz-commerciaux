import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';

import { IDENTIFIANT_AIRTABLE } from '@/lib/airtable/contrat';
import { exigerSession } from '@/lib/auth/session-serveur';
import { firestoreAdmin } from '@/lib/firebase/admin';
import { enFormation, type Formation } from '@/lib/formations/lecture';
import { STATUTS_SERVIS } from '@/lib/questions/modele';
import type { StatutQuestion } from '@/lib/questions/modele';

/**
 * Lecture serveur d'un sujet : son nom, ses fiches, ses questions, sa
 * présentation.
 *
 * **Pourquoi le serveur.** Comme le référentiel : le sujet, ses fiches et ses
 * questions sont lisibles par tout le domaine, et la session le vérifie déjà.
 * La présentation, elle, est fermée au navigateur par les règles — seul le
 * back-office la lit en direct —, et c'est ici qu'un commercial la reçoit,
 * avec la page.
 *
 * **Seules les questions du sujet.** La page n'a besoin que de leurs
 * identifiants et de leurs fiches pour calculer une maîtrise. Relire tout le
 * référentiel, comme l'accueil, coûterait cent cinquante documents pour en
 * garder une dizaine.
 */

export type SujetCharge = {
  id: string;
  nom: string;
  /** Toutes ses fiches, actives ou non : les questions d'une fiche retirée comptent encore. */
  fiches: [Formation, ...Formation[]];
  /** Questions servies du sujet, réduites à ce qu'une maîtrise demande. */
  questions: { id: string; formationIds: string[] }[];
  presentation: { url: string; presenteeLeMs: number; presentePar: string } | null;
};

/** Limite d'un filtre `array-contains-any` chez Firestore. */
const VALEURS_PAR_REQUETE = 30;

/**
 * Le sujet, ou `null` s'il n'existe pas ou n'a aucune fiche — la page rend
 * alors « introuvable ». Un identifiant mal formé ne déclenche aucune lecture.
 */
export async function chargerSujet(id: string): Promise<SujetCharge | null> {
  await exigerSession();
  if (!IDENTIFIANT_AIRTABLE.test(id)) return null;

  const base = firestoreAdmin();

  const [sujet, fichesLues, presentation] = await Promise.all([
    base.collection('sujets').doc(id).get(),
    base.collection('formations').where('sujetId', '==', id).get(),
    base.collection('presentations').doc(id).get(),
  ]);

  const nom = sujet.get('nom');
  if (!sujet.exists || typeof nom !== 'string') return null;

  const fiches = fichesLues.docs.map((document) => enFormation(document.id, document.data()));
  if (fiches.length === 0) return null;

  const ficheIds = fiches.map((fiche) => fiche.id);
  const lots = await Promise.all(
    Array.from({ length: Math.ceil(ficheIds.length / VALEURS_PAR_REQUETE) }, (_, index) =>
      base
        .collection('questions')
        .where(
          'formationIds',
          'array-contains-any',
          ficheIds.slice(index * VALEURS_PAR_REQUETE, (index + 1) * VALEURS_PAR_REQUETE),
        )
        .select('formationIds', 'statut')
        .get(),
    ),
  );

  /*
   * Le statut se filtre ici, pas dans la requête : Firestore n'accepte pas
   * `in` à côté de `array-contains-any`. Un sujet compte quelques dizaines de
   * questions au plus — les brouillons lus en trop ne pèsent rien.
   */
  const vues = new Set<string>();
  const questions = lots
    .flatMap((lot) => lot.docs)
    .filter((document) => {
      if (vues.has(document.id)) return false;
      vues.add(document.id);
      return STATUTS_SERVIS.includes(document.get('statut') as StatutQuestion);
    })
    .map((document) => ({
      id: document.id,
      formationIds: (document.get('formationIds') as unknown[]).filter(
        (valeur): valeur is string => typeof valeur === 'string',
      ),
    }));

  return {
    id,
    nom,
    fiches: fiches as [Formation, ...Formation[]],
    questions,
    presentation: enPresentation(presentation.data()),
  };
}

function enPresentation(
  donnees: Record<string, unknown> | undefined,
): SujetCharge['presentation'] {
  if (!donnees) return null;
  const { url, presenteeLe, presentePar } = donnees;
  if (typeof url !== 'string' || !(presenteeLe instanceof Timestamp)) return null;
  return {
    url,
    presenteeLeMs: presenteeLe.toMillis(),
    presentePar: typeof presentePar === 'string' ? presentePar : '',
  };
}
