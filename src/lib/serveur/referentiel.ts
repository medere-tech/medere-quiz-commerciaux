import 'server-only';

import { enFormation, type Formation } from '@/lib/formations/lecture';
import { enQuestion, type Question } from '@/lib/questions/lecture';
import { exigerSession } from '@/lib/auth/session-serveur';
import { firestoreAdmin } from '@/lib/firebase/admin';
import { FieldPath } from 'firebase-admin/firestore';

/**
 * Lecture serveur du référentiel : les questions publiées et les formations.
 *
 * **Pourquoi passer par le serveur.** Le navigateur ne peut pas interroger
 * Firestore avant d'avoir obtenu son jeton d'attestation App Check — le SDK
 * attend les deux jetons avant d'émettre la requête, c'est structurel. La
 * page arrivait donc vide, puis se remplissait après cette négociation. Rendu
 * au serveur, le référentiel part avec le HTML.
 *
 * **Ce qui passe ici, et rien d'autre.** Les questions publiées et les
 * formations qu'elles citent sont lisibles par tout utilisateur authentifié du
 * domaine : les règles n'y appliquent qu'un contrôle d'appartenance, que la
 * session vérifie déjà. Aucune garantie n'est donc perdue à les lire avec le
 * SDK Admin.
 *
 * **Ce qui n'y passera pas.** Les états par question, la progression et les
 * réponses restent lus par le SDK client, sous le contrôle des règles. Leur
 * confidentialité est aujourd'hui garantie par la base, pas par notre
 * discipline : le SDK Admin contournant toutes les règles, les faire passer
 * ici échangerait cette garantie contre quelques centaines de millisecondes.
 * Si la question se repose, elle se tranchera explicitement et se documentera
 * au README — pas en marge d'une optimisation.
 *
 * **La session est exigée avant toute lecture.** Sans elle, cette fonction
 * servirait le catalogue à un visiteur anonyme, ce que les règles
 * interdisent au navigateur.
 */

export type Referentiel = {
  questions: Question[];
  formations: Formation[];
};

/** Limite d'un filtre `in` chez Firestore : trente valeurs par requête. */
const VALEURS_PAR_REQUETE_IN = 30;

export async function chargerReferentiel(): Promise<Referentiel> {
  // Lève si personne n'est connecté : les dispositions rendent alors l'écran
  // de connexion, et cette lecture n'a pas lieu.
  await exigerSession();

  const base = firestoreAdmin();

  const instantane = await base.collection('questions').where('statut', '==', 'publiee').get();
  const questions = instantane.docs.map((document) => enQuestion(document.id, document.data()));

  /*
   * Seules les formations que les questions publiées citent. Le référentiel
   * en compte cent soixante-et-onze, le parcours n'en affiche que celles de
   * ses questions — en charger la totalité coûtait l'essentiel du temps de
   * cette lecture, pour des documents que personne ne regarde.
   */
  const cites = [...new Set(questions.flatMap((question) => question.formationIds))];

  const lots = await Promise.all(
    Array.from({ length: Math.ceil(cites.length / VALEURS_PAR_REQUETE_IN) }, (_, index) =>
      base
        .collection('formations')
        .where(
          FieldPath.documentId(),
          'in',
          cites.slice(index * VALEURS_PAR_REQUETE_IN, (index + 1) * VALEURS_PAR_REQUETE_IN),
        )
        .get(),
    ),
  );

  const formations = lots
    .flatMap((lot) => lot.docs)
    .map((document) => enFormation(document.id, document.data()))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

  return { questions, formations };
}
