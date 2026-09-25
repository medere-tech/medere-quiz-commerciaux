import { Recompenses } from '@/composants/parcours/Recompenses';
import { lireSession } from '@/lib/auth/session-serveur';
import { monParcours } from '@/lib/serveur/donnees-privees';
import { etatsDesQuestions } from '@/lib/serie/etats';
import { chargerReferentielSiConnecte } from '@/lib/serveur/referentiel';

/** 04b · Récompenses et équipe. */
export default async function PageRecompenses() {
  const session = await lireSession();
  if (!session) return null;

  /*
   * **Le référentiel et l'historique partent ensemble**, comme sur l'accueil :
   * ils ne dépendent pas l'un de l'autre, et les enchaîner doublerait
   * l'attente du rendu.
   */
  const [referentiel, parcours] = await Promise.all([
    chargerReferentielSiConnecte(),
    monParcours(),
  ]);
  if (!referentiel) return null;

  return (
    <Recompenses
      referentiel={referentiel}
      parcours={{
        uid: parcours.uid,
        progression: parcours.progression,
        etats: etatsDesQuestions(
          referentiel.questions.map((question) => question.id),
          parcours.etats,
        ),
      }}
    />
  );
}
