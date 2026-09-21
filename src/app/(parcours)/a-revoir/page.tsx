import { ARevoir } from '@/composants/parcours/ARevoir';
import { monParcours } from '@/lib/serveur/donnees-privees';
import { etatsDesQuestions } from '@/lib/serie/etats';
import { chargerReferentielSiConnecte } from '@/lib/serveur/referentiel';

/** 05 · Questions à revoir. */
export default async function PageARevoir() {
  /* Le référentiel et l'historique partent ensemble : ils ne dépendent pas
     l'un de l'autre, et les enchaîner doublerait l'attente du rendu. */
  const [referentiel, parcours] = await Promise.all([
    chargerReferentielSiConnecte(),
    monParcours(),
  ]);
  // Personne n'est connecté : la disposition rend l'écran de connexion, et
  // ce que cette page renvoie est écarté. On ne charge donc rien.
  if (!referentiel) return null;

  return (
    <ARevoir
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
