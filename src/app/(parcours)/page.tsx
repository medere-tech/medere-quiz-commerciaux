import { Accueil } from '@/composants/parcours/Accueil';
import { lireSession } from '@/lib/auth/session-serveur';
import { monParcours } from '@/lib/serveur/donnees-privees';
import { etatsDesQuestions } from '@/lib/serie/etats';
import { chargerReferentielSiConnecte } from '@/lib/serveur/referentiel';

/** 01 · Accueil du commercial. */
export default async function PageAccueil() {
  // La session est mémoïsée pour la requête : la disposition l'a déjà
  // demandée, et les deux appels partagent le même aller-retour.
  const session = await lireSession();
  if (!session) return null;

  /*
   * **Le référentiel et l'historique partent ensemble.** Ils ne dépendent pas
   * l'un de l'autre ; les enchaîner doublerait l'attente du rendu.
   */
  const [referentiel, parcours] = await Promise.all([
    chargerReferentielSiConnecte(),
    monParcours(),
  ]);
  if (!referentiel) return null;

  const prenom = (session.nom || session.email).split(' ')[0] ?? '';

  return (
    <Accueil
      prenom={prenom}
      referentiel={referentiel}
      parcours={{
        uid: parcours.uid,
        progression: parcours.progression,
        /* La même complétion qu'au client : une question sans document d'état
           n'a jamais été vue, et son absence *est* l'information. */
        etats: etatsDesQuestions(
          referentiel.questions.map((question) => question.id),
          parcours.etats,
        ),
      }}
    />
  );
}
