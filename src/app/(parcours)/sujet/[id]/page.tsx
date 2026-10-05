import { Bouton } from '@/composants/ds/primitives';
import { EtatVide } from '@/composants/ds/etats';
import { PageSujet } from '@/composants/parcours/PageSujet';
import { lireSession } from '@/lib/auth/session-serveur';
import { monParcours } from '@/lib/serveur/donnees-privees';
import { chargerSujet } from '@/lib/serveur/sujets';
import { etatsDesQuestions } from '@/lib/serie/etats';
import {
  fichesAffichees,
  fichesIndiscernables,
  identiteDuSujet,
  maitriseDuSujet,
  publicsDuSujet,
} from '@/lib/sujets/sujet';

type Parametres = { params: Promise<{ id: string }> };

/**
 * La page d'un sujet. On y arrive depuis « Avancement par formation » sur
 * l'accueil : l'avancement reste par formation, c'est ce que les états
 * mesurent, et seule cette page regroupe.
 *
 * Page serveur de bout en bout : le sujet, ses fiches, ses questions, sa
 * présentation et l'historique du commercial partent avec le HTML.
 */
export default async function PageDuSujet({ params }: Parametres) {
  // Personne n'est connecté : la disposition rend l'écran de connexion, et ce
  // que cette page renvoie est écarté. On ne charge donc rien.
  if (!(await lireSession())) return null;

  const { id } = await params;
  /* Le sujet et l'historique partent ensemble : ils ne dépendent pas l'un de
     l'autre, et les enchaîner doublerait l'attente du rendu. */
  const [sujet, parcours] = await Promise.all([chargerSujet(id), monParcours()]);

  if (!sujet) {
    return (
      <div className="page-admin">
        <EtatVide
          icone="book"
          titre="Ce sujet n’existe pas, ou plus"
          texte="Il a pu être retiré du catalogue. Les formations restent sur l’accueil."
          actions={
            <Bouton variante="secondaire" href="/">
              Revenir à l’accueil
            </Bouton>
          }
        />
      </div>
    );
  }

  const ficheIds = new Set(sujet.fiches.map((fiche) => fiche.id));
  const etats = etatsDesQuestions(
    sujet.questions.map((question) => question.id),
    parcours.etats,
  );
  const affichees = fichesAffichees(sujet.fiches);

  return (
    <PageSujet
      id={sujet.id}
      nom={sujet.nom}
      publics={publicsDuSujet(affichees.length > 0 ? affichees : sujet.fiches)}
      forme={identiteDuSujet(sujet.fiches)}
      fiches={affichees}
      indiscernables={[...fichesIndiscernables(affichees)]}
      maitrise={maitriseDuSujet(sujet.questions, etats, ficheIds)}
      presentation={sujet.presentation}
    />
  );
}
